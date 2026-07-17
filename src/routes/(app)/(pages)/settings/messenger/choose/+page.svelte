<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
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
		<div class="fb-choose">
			<div class="fb-choose__card">
				<p class="fb-choose__expired">
					This connection step expired. Start the Facebook connection again to choose a Page.
				</p>
				<footer class="fb-choose__footer">
					<Button onclick={() => goto('/api/settings/messenger/connect')}>
						Reconnect Facebook
					</Button>
				</footer>
			</div>
		</div>
	{:else}
		<div class="fb-choose">
			<div class="fb-choose__card">
				<fieldset class="fb-choose__pages" aria-label="Facebook Pages">
					{#each pages as page (page.id)}
						<label class="fb-choose__page" class:fb-choose__page--active={selectedId === page.id}>
							<input
								type="radio"
								name="page"
								value={page.id}
								bind:group={selectedId}
								class="fb-choose__radio"
							/>
							<span class="fb-choose__name">{page.name}</span>
						</label>
					{/each}
				</fieldset>

				<footer class="fb-choose__footer">
					<Button
						onclick={connect}
						disabled={!selectedId}
						loading={connecting}
						loadingLabel="Connecting…"
					>
						Connect Page
					</Button>
				</footer>
			</div>
		</div>
	{/if}
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.fb-choose {
		max-width: 560px;

		&__card {
			display: flex;
			flex-direction: column;
			gap: $space-4;
			padding: $space-5;
			border-radius: $radius-xl;
			background: var(--color-bg-surface);
			box-shadow: var(--shadow-sm);
		}

		&__expired {
			font-size: $fs-body;
			line-height: $lh-body;
			color: var(--color-text-secondary);
		}

		&__pages {
			display: flex;
			flex-direction: column;
			gap: $space-2;
			margin: 0;
			padding: 0;
			border: 0;
		}

		&__page {
			display: flex;
			align-items: center;
			gap: $space-3;
			min-height: 52px;
			padding: $space-3 $space-4;
			border: 1px solid var(--color-border);
			border-radius: $radius-lg;
			cursor: pointer;
			transition:
				background $duration-fast $ease-standard,
				border-color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}

			&--active {
				border-color: var(--color-brand);
				background: var(--state-active-tint);
			}
		}

		&__radio {
			width: 18px;
			height: 18px;
			flex-shrink: 0;
			accent-color: var(--color-brand);
		}

		&__name {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__footer {
			display: flex;
			justify-content: flex-end;
		}
	}
</style>
