<script lang="ts">
	import { onMount } from 'svelte';
	import { resolveRoute } from '$app/paths';
	import { jafarDashboardStore } from '$lib/stores/jafarDashboard.svelte';
	import AdminTableSkeleton from '$lib/components/jafar/skeletons/AdminTableSkeleton.svelte';

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
		switch (s) {
			case 'active':
				return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30';
			case 'suspended':
				return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30';
			case 'pending_deletion':
				return 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30';
			default:
				return 'bg-slate-700/40 text-slate-300 ring-1 ring-slate-600/40';
		}
	}
</script>

<svelte:head>
	<title>Jafar Dashboard</title>
</svelte:head>

<div class="space-y-8">
	<!-- Header (always instant) -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">Dashboard</h1>
			<p class="mt-1 text-sm text-slate-400">
				Manage organizations and monitor platform events.
				{#if status === 'revalidating'}
					<span class="ml-1 inline-flex items-center gap-1 text-xs text-slate-500">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="animate-spin"
							aria-hidden="true"
						>
							<path d="M21 12a9 9 0 1 1-6.219-8.56" />
						</svg>
						Refreshing
					</span>
				{/if}
			</p>
		</div>
		<a
			href="/jafar/orgs/new"
			class="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 text-sm font-semibold text-white shadow-md shadow-red-900/40 hover:from-red-500 hover:to-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 transition-all"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.4"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			Create organization
		</a>
	</div>

	{#if showSkeleton}
		<AdminTableSkeleton columns={6} rows={6} title="Loading organizations" />
		<AdminTableSkeleton columns={6} rows={3} title="Loading dead letters" />
	{:else if showError}
		<div
			role="alert"
			class="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-6 text-center"
		>
			<p class="text-sm font-semibold text-red-200">Failed to load dashboard</p>
			<p class="mt-1 text-xs text-red-300/80">{fetchError ?? 'Unknown error.'}</p>
			<button
				type="button"
				onclick={() => jafarDashboardStore.refresh()}
				class="mt-4 inline-flex h-9 items-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 text-xs font-semibold text-red-100 hover:border-red-400/60 hover:bg-red-500/20 transition-colors cursor-pointer"
			>
				Retry
			</button>
		</div>
	{:else}
		<!-- Organizations -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
				<div>
					<h2 class="text-base font-semibold text-white">Organizations</h2>
					<p class="mt-0.5 text-xs text-slate-500">
						{orgs.length}
						{orgs.length === 1 ? 'organization' : 'organizations'}
					</p>
				</div>
			</header>

			{#if orgs.length === 0}
				<div class="px-5 py-12 text-center">
					<p class="text-sm text-slate-400">No organizations yet.</p>
					<p class="mt-1 text-xs text-slate-500">Create your first organization to get started.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead
							class="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
						>
							<tr>
								<th class="px-5 py-3 text-left">Name</th>
								<th class="px-5 py-3 text-left">Status</th>
								<th class="px-5 py-3 text-left">Trade</th>
								<th class="px-5 py-3 text-left">Setup</th>
								<th class="px-5 py-3 text-left">Created</th>
								<th class="px-5 py-3 text-right"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-800/70">
							{#each orgs as org (org.id)}
								<tr class="hover:bg-slate-800/30 transition-colors">
									<td class="px-5 py-3.5">
										<div class="font-medium text-white">{org.name}</div>
										<div class="text-xs text-slate-500">{org.slug}</div>
									</td>
									<td class="px-5 py-3.5">
										<span
											class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize {statusClasses(
												org.status
											)}"
										>
											{org.status.replace('_', ' ')}
										</span>
									</td>
									<td class="px-5 py-3.5 text-slate-300">{org.trade_type}</td>
									<td class="px-5 py-3.5">
										{#if org.is_setup_complete}
											<span class="text-emerald-400 text-xs font-medium">Complete</span>
										{:else}
											<span class="text-slate-500 text-xs">Pending</span>
										{/if}
									</td>
									<td class="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">
										{new Date(org.created_at).toLocaleDateString()}
									</td>
									<td class="px-5 py-3.5 text-right">
										<a
											href={resolveRoute('/jafar/orgs/[id]', { id: org.id })}
											data-sveltekit-preload-code="viewport"
											data-sveltekit-preload-data="hover"
											class="inline-flex h-8 items-center rounded-lg border border-slate-700 bg-slate-900/60 px-3 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white transition-colors"
										>
											Open
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<!-- Dead Letters -->
		<section
			class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
		>
			<header class="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
				<div>
					<h2 class="text-base font-semibold text-white">Dead letters</h2>
					<p class="mt-0.5 text-xs text-slate-500">Failed events requiring manual review.</p>
				</div>
				{#if deadLetters.length > 0}
					<span
						class="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-500/30"
					>
						{deadLetters.length} pending
					</span>
				{/if}
			</header>

			{#if actionError}
				<div
					class="border-b border-red-500/30 bg-red-500/10 px-5 py-3 text-sm text-red-300"
					role="alert"
				>
					{actionError}
				</div>
			{/if}

			{#if deadLetters.length === 0}
				<div class="px-5 py-12 text-center">
					<p class="text-sm text-slate-400">No dead-lettered events.</p>
					<p class="mt-1 text-xs text-slate-500">The outbox worker is healthy.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead
							class="bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
						>
							<tr>
								<th class="px-5 py-3 text-left">Org</th>
								<th class="px-5 py-3 text-left">Event</th>
								<th class="px-5 py-3 text-left">Error</th>
								<th class="px-5 py-3 text-left">Attempts</th>
								<th class="px-5 py-3 text-left">Failed at</th>
								<th class="px-5 py-3 text-right"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-800/70">
							{#each deadLetters as event (event.id)}
								<tr class="hover:bg-slate-800/30 transition-colors">
									<td class="px-5 py-3.5 font-mono text-xs text-slate-400">
										{event.org_id ? event.org_id.slice(0, 8) + '…' : 'platform'}
									</td>
									<td class="px-5 py-3.5 text-slate-300">{event.event_type}</td>
									<td
										class="px-5 py-3.5 text-xs text-slate-400 max-w-xs truncate"
										title={event.last_error ?? ''}
									>
										{event.last_error ?? '—'}
									</td>
									<td class="px-5 py-3.5 text-slate-300">{event.attempts}</td>
									<td class="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
										{event.dead_lettered_at
											? new Date(event.dead_lettered_at).toLocaleString()
											: '—'}
									</td>
									<td class="px-5 py-3.5 text-right">
										<div class="inline-flex items-center gap-2">
											<button
												type="button"
												disabled={busyEventId === event.id}
												onclick={() => postEventAction(event.id, 'retry')}
												class="inline-flex h-8 items-center rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
											>
												Retry
											</button>
											<button
												type="button"
												disabled={busyEventId === event.id}
												onclick={() => postEventAction(event.id, 'dismiss')}
												class="inline-flex h-8 items-center rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
											>
												Dismiss
											</button>
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
			<p class="text-xs text-amber-400/80" role="status">
				{fetchError} Showing cached data.
			</p>
		{/if}
	{/if}
</div>
