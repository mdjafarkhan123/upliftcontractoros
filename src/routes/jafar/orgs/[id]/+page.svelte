<script lang="ts">
	import { invalidate } from '$app/navigation';

	type Org = {
		id: string;
		name: string;
		slug: string;
		status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
		trade_type: string;
		city: string | null;
		state: string | null;
		timezone: string;
		twilio_phone_number: string;
		is_setup_complete: boolean;
		created_at: string;
		updated_at: string;
	};

	let { data } = $props<{ data: { org: Org } }>();
	let updating = $state(false);
	let error = $state('');

	async function updateStatus(status: 'active' | 'suspended') {
		if (updating) return;
		updating = true;
		error = '';

		try {
			const res = await fetch(`/api/admin/orgs/${data.org.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Status update failed');
			}
			await invalidate(`/api/admin/orgs/${data.org.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Status update failed';
		} finally {
			updating = false;
		}
	}

	async function completeSetup() {
		if (updating) return;
		updating = true;
		error = '';

		try {
			const res = await fetch(`/api/admin/orgs/${data.org.id}/complete-setup`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? 'Setup completion failed');
			}
			await invalidate(`/api/admin/orgs/${data.org.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Setup completion failed';
		} finally {
			updating = false;
		}
	}
</script>

<svelte:head>
	<title>Organization</title>
</svelte:head>

<main>
	<h1>{data.org.name}</h1>
	<p><a href="/jafar/dashboard">Back to dashboard</a></p>

	{#if error}
		<p role="alert">{error}</p>
	{/if}

	<dl>
		<dt>ID</dt>
		<dd>{data.org.id}</dd>
		<dt>Slug</dt>
		<dd>{data.org.slug}</dd>
		<dt>Status</dt>
		<dd>{data.org.status}</dd>
		<dt>Trade type</dt>
		<dd>{data.org.trade_type}</dd>
		<dt>Location</dt>
		<dd>{data.org.city}, {data.org.state}</dd>
		<dt>Timezone</dt>
		<dd>{data.org.timezone}</dd>
		<dt>Twilio phone</dt>
		<dd>{data.org.twilio_phone_number}</dd>
		<dt>Setup</dt>
		<dd>{data.org.is_setup_complete ? 'complete' : 'incomplete'}</dd>
		<dt>Created</dt>
		<dd>{new Date(data.org.created_at).toLocaleString()}</dd>
	</dl>

	<h2>Actions</h2>
	<button
		type="button"
		disabled={updating || data.org.status === 'active'}
		onclick={() => updateStatus('active')}
	>
		Set active
	</button>
	<button
		type="button"
		disabled={updating || data.org.status === 'suspended'}
		onclick={() => updateStatus('suspended')}
	>
		Set suspended
	</button>
	<button type="button" disabled={updating || data.org.is_setup_complete} onclick={completeSetup}>
		Complete setup
	</button>
</main>
