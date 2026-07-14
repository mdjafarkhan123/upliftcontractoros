<script lang="ts">
	import { onMount } from 'svelte';
	import { resolveRoute } from '$app/paths';
	import { jafarDashboardStore } from '$lib/stores/jafarDashboard.svelte';
	import AdminTableSkeleton from '$lib/components/jafar/skeletons/AdminTableSkeleton.svelte';
	import SmsMasterFloorCard from '$lib/components/jafar/SmsMasterFloorCard.svelte';
	import PlatformEmailDomainPanel from '$lib/components/jafar/PlatformEmailDomainPanel.svelte';

	let busyEventId = $state<string | null>(null);
	let actionError = $state('');

	onMount(() => {
		jafarDashboardStore.load();
	});

	const status = $derived(jafarDashboardStore.status);
	const hasCache = $derived(jafarDashboardStore.hasCache);
	const orgs = $derived(jafarDashboardStore.orgs);
	const deadLetters = $derived(jafarDashboardStore.deadLetters);
	const fetchError = $derived(jafarDashboardStore.error);
	const showSkeleton = $derived(status === 'loading' && !hasCache);
	const showError = $derived(status === 'error' && !hasCache);

	async function postEventAction(id: string, action: 'retry' | 'dismiss') {
		if (busyEventId) return;
		busyEventId = id;
		actionError = '';

		try {
			const res = await fetch(`/api/admin/outbox-events/${id}/${action}`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? body.message ?? 'Action failed');
			}
			await jafarDashboardStore.refresh();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Action failed';
		} finally {
			busyEventId = null;
		}
	}

	function statusClasses(s: string): string {
		return `jafar-badge jafar-badge--${s}`;
	}
</script>

<svelte:head>
	<title>Jafar Dashboard</title>
</svelte:head>

<div class="jafar-dash">
	<div class="jafar-dash__hd">
		<div>
			<h1 class="jafar-dash__title">Dashboard</h1>
			<p class="jafar-dash__sub">
				Manage organizations and monitor platform events.
				{#if status === 'revalidating'}
					<span class="jafar-dash__refresh">
						<i class="ri-loader-4-line" aria-hidden="true"></i>
						Refreshing
					</span>
				{/if}
			</p>
		</div>
		<a href="/jafar/orgs/new" class="jafar-btn jafar-btn--red">
			<i class="ri-add-line" aria-hidden="true"></i>
			Create organization
		</a>
	</div>

	<SmsMasterFloorCard />
	<PlatformEmailDomainPanel />

	{#if showSkeleton}
		<AdminTableSkeleton columns={6} rows={6} title="Loading organizations" />
		<AdminTableSkeleton columns={6} rows={3} title="Loading dead letters" />
	{:else if showError}
		<div role="alert" class="jafar-alert jafar-alert--error jafar-alert--center">
			<p class="jafar-alert__title">Failed to load dashboard</p>
			<p class="jafar-alert__text">{fetchError ?? 'Unknown error.'}</p>
			<button
				type="button"
				onclick={() => jafarDashboardStore.refresh()}
				class="jafar-btn"
				style="margin-top: 0.5rem;"
			>
				Retry
			</button>
		</div>
	{:else}
		<!-- Organizations -->
		<section class="jafar-panel">
			<header class="jafar-panel__head">
				<div>
					<h2 class="jafar-panel__title">Organizations</h2>
					<p class="jafar-panel__sub">
						{orgs.length}
						{orgs.length === 1 ? 'organization' : 'organizations'}
					</p>
				</div>
			</header>

			{#if orgs.length === 0}
				<div class="jafar-panel__body jafar-dash__empty">
					<p>No organizations yet.</p>
					<p>Create your first organization to get started.</p>
				</div>
			{:else}
				<div class="jafar-dash__scroll">
					<table class="jafar-tbl">
						<thead>
							<tr>
								<th>Name</th>
								<th>Status</th>
								<th>Trade</th>
								<th>Setup</th>
								<th>Created</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each orgs as org (org.id)}
								<tr>
									<td>
										<div class="jafar-tbl__name">{org.name}</div>
										<div class="jafar-tbl__sub">{org.slug}</div>
									</td>
									<td>
										<span class={statusClasses(org.status)}>
											{org.status.replace('_', ' ')}
										</span>
									</td>
									<td>{org.trade_type}</td>
									<td>
										{#if org.is_setup_complete}
											<span class="jafar-dash__ok">Complete</span>
										{:else}
											<span class="jafar-dash__muted">Pending</span>
										{/if}
									</td>
									<td class="jafar-tbl__mono">
										{new Date(org.created_at).toLocaleDateString()}
									</td>
									<td>
										<div class="jafar-tbl__actions">
											<a
												href="{resolveRoute('/jafar/orgs/[id]', { id: org.id })}?tab=details"
												data-sveltekit-preload-code="viewport"
												data-sveltekit-preload-data="hover"
												class="jafar-btn jafar-btn--sm"
											>View Details</a>
											<a
												href={resolveRoute('/jafar/orgs/[id]', { id: org.id })}
												data-sveltekit-preload-code="viewport"
												data-sveltekit-preload-data="hover"
												class="jafar-btn jafar-btn--sm"
											>Open</a>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Dead Letters -->
		<section class="jafar-panel">
			<header class="jafar-panel__head jafar-panel__head--between">
				<div>
					<h2 class="jafar-panel__title">Dead letters</h2>
					<p class="jafar-panel__sub">Failed events requiring manual review.</p>
				</div>
				{#if deadLetters.length > 0}
					<span class="jafar-badge jafar-badge--red">{deadLetters.length} pending</span>
				{/if}
			</header>

			{#if actionError}
				<div role="alert" class="jafar-dash__action-err">{actionError}</div>
			{/if}

			{#if deadLetters.length === 0}
				<div class="jafar-panel__body jafar-dash__empty">
					<p>No dead-lettered events.</p>
					<p>The outbox worker is healthy.</p>
				</div>
			{:else}
				<div class="jafar-dash__scroll">
					<table class="jafar-tbl">
						<thead>
							<tr>
								<th>Org</th>
								<th>Event</th>
								<th>Error</th>
								<th>Attempts</th>
								<th>Failed at</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each deadLetters as event (event.id)}
								<tr>
									<td class="jafar-tbl__mono">
										{event.org_id ? event.org_id.slice(0, 8) + '…' : 'platform'}
									</td>
									<td>{event.event_type}</td>
									<td class="jafar-dash__error-cell" title={event.last_error ?? ''}>
										{event.last_error ?? '—'}
									</td>
									<td>{event.attempts}</td>
									<td class="jafar-tbl__mono">
										{event.dead_lettered_at
											? new Date(event.dead_lettered_at).toLocaleString()
											: '—'}
									</td>
									<td>
										<div class="jafar-tbl__actions">
											<button
												type="button"
												disabled={busyEventId === event.id}
												onclick={() => postEventAction(event.id, 'retry')}
												class="jafar-btn jafar-btn--sm"
											>Retry</button>
											<button
												type="button"
												disabled={busyEventId === event.id}
												onclick={() => postEventAction(event.id, 'dismiss')}
												class="jafar-btn jafar-btn--sm jafar-btn--ghost"
											>Dismiss</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		{#if fetchError && hasCache}
			<p class="jafar-dash__cache-warn" role="status">
				{fetchError} Showing cached data.
			</p>
		{/if}
	{/if}
</div>

<style lang="scss">
	.jafar-dash {
		display: flex;
		flex-direction: column;
		gap: 2rem;

		&__hd {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			@media (min-width: 640px) {
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
			}
		}

		&__title {
			font-size: 1.5rem;
			font-weight: 700;
			letter-spacing: -0.02em;
			color: #fff;
			@media (min-width: 640px) { font-size: 1.875rem; }
		}

		&__sub {
			margin-top: 0.25rem;
			font-size: 0.875rem;
			color: #94a3b8;
		}

		&__refresh {
			margin-left: 0.25rem;
			display: inline-flex;
			align-items: center;
			gap: 0.25rem;
			font-size: 0.75rem;
			color: #64748b;
			i { animation: jafar-spin 0.7s linear infinite; font-size: 0.625rem; }
		}

		&__scroll { overflow-x: auto; }

		&__empty {
			padding: 3rem 1.25rem;
			text-align: center;
			p:first-child { font-size: 0.875rem; color: #94a3b8; }
			p + p { margin-top: 0.25rem; font-size: 0.75rem; color: #64748b; }
		}

		&__ok    { font-size: 0.75rem; font-weight: 500; color: #34d399; }
		&__muted { font-size: 0.75rem; color: #64748b; }

		&__action-err {
			border-bottom: 1px solid rgba(239, 68, 68, 0.3);
			background: rgba(239, 68, 68, 0.1);
			padding: 0.75rem 1.25rem;
			font-size: 0.875rem;
			color: #fca5a5;
		}

		&__error-cell {
			font-size: 0.75rem;
			color: #94a3b8;
			max-width: 20rem;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__cache-warn {
			font-size: 0.75rem;
			color: rgba(251, 191, 36, 0.8);
		}
	}
</style>
