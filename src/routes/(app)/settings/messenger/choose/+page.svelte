<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';

	type Candidate = { id: string; name: string };

	const member = getMemberContext();
	let m = $derived(member());

	let loading = $state(true);
	let expired = $state(false);
	let connecting = $state(false);
	let pages = $state<Candidate[]>([]);
	let selectedId = $state('');

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/messenger/choose');
			if (res.status === 410) {
				expired = true;
				return;
			}
			const body = (await res.json()) as { data?: { pages: Candidate[] }; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Could not load your Facebook Pages.');
				expired = true;
				return;
			}
			pages = body.data.pages;
			selectedId = pages[0]?.id ?? '';
		} catch {
			toast.error('Could not load your Facebook Pages.');
			expired = true;
		} finally {
			loading = false;
		}
	}

	async function connect() {
		if (connecting || !selectedId) return;
		connecting = true;
		try {
			const res = await fetch('/api/settings/messenger/choose', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ page_id: selectedId })
			});
			if (res.status === 410) {
				expired = true;
				return;
			}
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Could not connect that Page.');
				return;
			}
			const chosen = pages.find((p) => p.id === selectedId);
			toast.success(chosen ? `Connected ${chosen.name}` : 'Facebook Page connected');
			goto('/settings/integrations?messenger=connected');
		} catch {
			toast.error('Could not connect that Page.');
		} finally {
			connecting = false;
		}
	}
</script>

<svelte:head><title>Choose a Facebook Page</title></svelte:head>

<PageWrapper
	title="Choose a Facebook Page"
	subtitle="Your account manages more than one Page. Pick the one to connect to your inbox."
	back="/settings/integrations"
>
	{#if loading}
		<SkeletonLoader lines={4} label="Loading your Facebook Pages" height="56px" />
	{:else if expired}
		<div class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
			<p class="text-sm text-muted-foreground">
				This connection step expired. Start the Facebook connection again to choose a Page.
			</p>
			<div class="flex justify-end">
				<Button onclick={() => goto('/api/settings/messenger/connect')}>Reconnect Facebook</Button>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
			<fieldset class="flex flex-col gap-2">
				<legend class="sr-only">Facebook Pages</legend>
				{#each pages as page (page.id)}
					<label
						class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent"
					>
						<input
							type="radio"
							name="page"
							value={page.id}
							bind:group={selectedId}
							class="size-4 accent-primary"
						/>
						<span class="text-sm font-medium text-foreground">{page.name}</span>
					</label>
				{/each}
			</fieldset>

			<footer class="flex justify-end">
				<Button onclick={connect} disabled={connecting || !selectedId}>
					{connecting ? 'Connecting…' : 'Connect Page'}
				</Button>
			</footer>
		</div>
	{/if}
</PageWrapper>
