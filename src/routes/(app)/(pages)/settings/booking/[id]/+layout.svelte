<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';

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
	<a href="/settings/booking" class="book-back">
		<i class="ri-arrow-left-line" aria-hidden="true"></i> Back to booking links
	</a>

	<nav class="book-tabs">
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class="book-tabs__tab"
				class:book-tabs__tab--active={isActive(t.href, t.exact)}
			>
				{t.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</PageWrapper>
