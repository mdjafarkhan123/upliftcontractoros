<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolveRoute } from '$app/paths';

	type OrgRow = {
		id: string;
		name: string;
		slug: string;
		status: string;
		trade_type: string;
		is_setup_complete: boolean;
		created_at: string;
	};

	type DeadLetterRow = {
		id: string;
		org_id: string | null;
		event_type: string;
		last_error: string | null;
		attempts: number;
		dead_lettered_at: string | null;
	};

	let { data } = $props<{
		data: { orgs: OrgRow[]; deadLetters: DeadLetterRow[] };
	}>();

	let busyEventId = $state<string | null>(null);
	let error = $state('');

	async function postEventAction(id: string, action: 'retry' | 'dismiss') {
		if (busyEventId) return;
		busyEventId = id;
		error = '';

		try {
			const res = await fetch(`/api/admin/outbox-events/${id}/${action}`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Action failed');
			}
			await invalidate('/api/admin/orgs');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Action failed';
		} finally {
			busyEventId = null;
		}
	}
</script>

<svelte:head>
	<title>Jafar Dashboard</title>
</svelte:head>

<main>
	<h1>Dashboard</h1>
	<p><a href="/jafar/orgs/new">Create organization</a></p>

	<h2>Organizations</h2>
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Status</th>
				<th>Trade type</th>
				<th>Setup</th>
				<th>Created</th>
				<th>Open</th>
			</tr>
		</thead>
		<tbody>
			{#each data.orgs as org (org.id)}
				<tr>
					<td>{org.name}</td>
					<td>{org.status}</td>
					<td>{org.trade_type}</td>
					<td>{org.is_setup_complete ? 'complete' : 'incomplete'}</td>
					<td>{new Date(org.created_at).toLocaleString()}</td>
					<td><a href={resolveRoute('/jafar/orgs/[id]', { id: org.id })}>View</a></td>
				</tr>
			{/each}
		</tbody>
	</table>

	<h2>Dead Letters</h2>
	{#if error}
		<p role="alert">{error}</p>
	{/if}
	<table>
		<thead>
			<tr>
				<th>Org ID</th>
				<th>Event type</th>
				<th>Last error</th>
				<th>Attempts</th>
				<th>Dead-lettered at</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.deadLetters as event (event.id)}
				<tr>
					<td>{event.org_id ?? 'platform'}</td>
					<td>{event.event_type}</td>
					<td>{event.last_error ?? ''}</td>
					<td>{event.attempts}</td>
					<td>{event.dead_lettered_at ? new Date(event.dead_lettered_at).toLocaleString() : ''}</td>
					<td>
						<button
							type="button"
							disabled={busyEventId === event.id}
							onclick={() => postEventAction(event.id, 'retry')}
						>
							Retry
						</button>
						<button
							type="button"
							disabled={busyEventId === event.id}
							onclick={() => postEventAction(event.id, 'dismiss')}
						>
							Dismiss
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>
