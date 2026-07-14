<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AppointmentForm from '$lib/components/appointments/AppointmentForm.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { getMemberContext } from '$lib/context/member';

	const member = getMemberContext();
	const canCreate = $derived(member().can_create_appointments);
	const canEditAssignee = $derived(member().can_view_all_appointments);

	const initialContact = $derived.by(() => {
		const id = page.url.searchParams.get('contact_id');
		const name = page.url.searchParams.get('contact_name');
		return id && name ? { id, full_name: name } : null;
	});
	const initialJob = $derived.by(() => {
		const id = page.url.searchParams.get('job_id');
		const title = page.url.searchParams.get('job_title');
		return id && title ? { id, title, status: 'scheduled' } : null;
	});
	const initialStart = $derived(page.url.searchParams.get('start'));
	const initialEnd = $derived(page.url.searchParams.get('end'));
	// Anytime create (from the calendar's Anytime lane): open with the toggle on.
	const initialAllDay = $derived(page.url.searchParams.get('all_day') === '1');

	let assignees = $state<{ id: string; full_name: string }[]>([]);

	onMount(async () => {
		if (!canEditAssignee) return;
		try {
			const res = await fetch('/api/appointments/assignees');
			if (res.ok) {
				const body = (await res.json()) as { assignees: typeof assignees };
				assignees = body.assignees;
			}
		} catch {
			// noop
		}
	});

	async function handleSubmit(payload: Record<string, unknown>) {
		try {
			const res = await fetch('/api/appointments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok) {
				return {
					ok: false,
					error: body.error ?? 'Could not create appointment.',
					field_errors: body.field_errors
				};
			}
			appointmentsStore.invalidate();
			await goto(`/appointments/${body.data.id}`);
			return { ok: true };
		} catch {
			return { ok: false, error: 'Network error. Try again.' };
		}
	}
</script>

<svelte:head><title>New appointment</title></svelte:head>

<PageWrapper title="New appointment" back="/appointments">
	{#if !canCreate}
		<EmptyState title="No access" description="You don't have permission to create appointments." />
	{:else}
		<div class="appt-new">
			<p class="appt-new__intro">Schedule an estimate, job start, or follow-up.</p>

			<AppointmentForm
				mode="create"
				{assignees}
				{canEditAssignee}
				{initialContact}
				{initialJob}
				{initialStart}
				{initialEnd}
				{initialAllDay}
				onCancel={() => goto('/appointments')}
				onSubmit={handleSubmit}
			/>
		</div>
	{/if}
</PageWrapper>
