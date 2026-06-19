<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { ArrowLeft } from '@lucide/svelte';

	let { data, children }: { data: { id: string }; children: import('svelte').Snippet } = $props();

	const member = getMemberContext();
	const flags = getFeatureFlagsContext();

	$effect(() => {
		if (member().role !== 'admin' || !flags().feature_online_booking) goto('/settings/booking');
	});

	const tabs = [
		{ href: `/settings/booking/${data.id}`, label: 'Settings', exact: true },
		{ href: `/settings/booking/${data.id}/availability`, label: 'Availability', exact: false },
		{ href: `/settings/booking/${data.id}/blocked`, label: 'Blocked Dates', exact: false }
	];

	const current = $derived($page.url.pathname);

	function isActive(href: string, exact: boolean): boolean {
		return exact ? current === href : current === href;
	}
</script>

<PageWrapper>
	<Button variant="ghost" href="/settings/booking" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to booking links
	</Button>

	<nav class="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class={[
					'inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors',
					isActive(t.href, t.exact)
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
				].join(' ')}
			>
				{t.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</PageWrapper>
