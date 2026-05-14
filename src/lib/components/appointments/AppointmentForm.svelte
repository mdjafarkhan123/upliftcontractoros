<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { dateTimeLocalValue } from '$lib/utils/calendar';
	import type { AppointmentDetail, AppointmentType } from '$lib/types/appointments';

	type Assignee = { id: string; full_name: string };
	type ContactOption = { id: string; full_name: string };
	type JobOption = { id: string; title: string; status: string };

	const TYPES: { value: AppointmentType; label: string }[] = [
		{ value: 'estimate', label: 'Estimate' },
		{ value: 'job_start', label: 'Job start' },
		{ value: 'follow_up', label: 'Follow-up' },
		{ value: 'inspection', label: 'Inspection' },
		{ value: 'other', label: 'Other' }
	];

	let {
		mode,
		appointment,
		assignees,
		canEditAssignee,
		initialContact,
		initialJob,
		submitLabel,
		onCancel,
		onSubmit
	}: {
		mode: 'create' | 'edit';
		appointment?: AppointmentDetail | null;
		assignees: Assignee[];
		canEditAssignee: boolean;
		initialContact?: ContactOption | null;
		initialJob?: JobOption | null;
		submitLabel?: string;
		onCancel: () => void;
		onSubmit: (
			payload: Record<string, unknown>
		) => Promise<{ ok: boolean; error?: string; field_errors?: Record<string, string> }>;
	} = $props();

	let contactId = $derived(appointment?.contact_id ?? initialContact?.id ?? '');
	let contactName = $derived(appointment?.contact_name ?? initialContact?.full_name ?? '');
	let contactQuery = $state('');
	let contactResults = $state<ContactOption[]>([]);
	let contactSearching = $state(false);

	let jobId = $derived(appointment?.job_id ?? initialJob?.id ?? '');
	let jobOptions = $derived<JobOption[]>(
		initialJob ? [initialJob] : appointment?.job_id && appointment.job_title
			? [{ id: appointment.job_id, title: appointment.job_title, status: 'scheduled' }]
			: []
	);

	let type = $derived<AppointmentType>(appointment?.type ?? 'estimate');
	let title = $derived(appointment?.title ?? '');
	let scheduledStart = $derived(dateTimeLocalValue(appointment?.scheduled_start ?? null));
	let scheduledEnd = $derived(dateTimeLocalValue(appointment?.scheduled_end ?? null));
	let location = $derived(appointment?.location ?? '');
	let notes = $derived(appointment?.notes ?? '');
	let assignedTo = $derived(appointment?.assigned_to ?? '');

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	let searchAbort: AbortController | null = null;

	async function searchContacts() {
		const q = contactQuery.trim();
		if (q.length < 2) {
			contactResults = [];
			return;
		}
		if (searchAbort) searchAbort.abort();
		const ctrl = new AbortController();
		searchAbort = ctrl;
		contactSearching = true;
		try {
			const params = new URLSearchParams({ q });
			const res = await fetch(`/api/contacts?${params.toString()}`, { signal: ctrl.signal });
			if (!res.ok) return;
			const body = (await res.json()) as { items: ContactOption[] };
			contactResults = body.items.slice(0, 8);
		} catch {
			// noop
		} finally {
			contactSearching = false;
		}
	}

	async function selectContact(c: ContactOption) {
		contactId = c.id;
		contactName = c.full_name;
		contactQuery = '';
		contactResults = [];
		jobId = '';
		await loadJobsForContact(c.id);
	}

	function clearContact() {
		contactId = '';
		contactName = '';
		jobId = '';
		jobOptions = [];
	}

	async function loadJobsForContact(id: string) {
		try {
			const res = await fetch(`/api/appointments/jobs-for-contact?contact_id=${id}`);
			if (!res.ok) return;
			const body = (await res.json()) as { items: JobOption[] };
			jobOptions = body.items;
		} catch {
			// noop
		}
	}

	async function submit() {
		errorMsg = null;
		fieldErrors = {};

		if (!contactId) {
			errorMsg = 'Pick a contact.';
			return;
		}
		if (!title.trim()) {
			fieldErrors.title = 'Title is required.';
			return;
		}
		if (!scheduledStart || !scheduledEnd) {
			fieldErrors.scheduled_end = 'Start and end times are required.';
			return;
		}

		const startDate = new Date(scheduledStart);
		const endDate = new Date(scheduledEnd);
		if (endDate.getTime() <= startDate.getTime()) {
			fieldErrors.scheduled_end = 'End time must be after start time.';
			return;
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = {
				type,
				title: title.trim(),
				scheduled_start: startDate.toISOString(),
				scheduled_end: endDate.toISOString(),
				location: location.trim() || null,
				notes: notes.trim() || null
			};
			if (mode === 'create') {
				payload.contact_id = contactId;
				payload.job_id = jobId || null;
			}
			if (canEditAssignee) {
				payload.assigned_to = assignedTo || null;
			}

			const result = await onSubmit(payload);
			if (!result.ok) {
				errorMsg = result.error ?? 'Could not save.';
				if (result.field_errors) fieldErrors = result.field_errors;
			}
		} finally {
			saving = false;
		}
	}
</script>

<form
	class="space-y-4"
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
>
	<!-- Contact -->
	<div class="space-y-1.5">
		<Label for="a-contact">
			Contact <span class="text-destructive">*</span>
		</Label>
		{#if mode === 'edit'}
			<Input id="a-contact" value={contactName} disabled />
		{:else if contactId}
			<div class="flex items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2">
				<span class="flex-1 text-sm font-medium text-foreground">{contactName}</span>
				<Button type="button" variant="ghost" size="sm" onclick={clearContact}>Change</Button>
			</div>
		{:else}
			<Input
				id="a-contact"
				placeholder="Search contacts by name, phone, or email…"
				bind:value={contactQuery}
				oninput={() => void searchContacts()}
			/>
			{#if contactResults.length > 0}
				<ul class="rounded-md border border-border bg-popover">
					{#each contactResults as c (c.id)}
						<li>
							<button
								type="button"
								class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
								onclick={() => void selectContact(c)}
							>
								{c.full_name}
							</button>
						</li>
					{/each}
				</ul>
			{:else if contactSearching}
				<p class="text-xs text-muted-foreground">Searching…</p>
			{/if}
		{/if}
	</div>

	<!-- Job (optional) -->
	{#if mode === 'create' && contactId && jobOptions.length > 0}
		<div class="space-y-1.5">
			<Label for="a-job">Linked job (optional)</Label>
			<select
				id="a-job"
				bind:value={jobId}
				class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">No job</option>
				{#each jobOptions as j (j.id)}
					<option value={j.id}>{j.title}</option>
				{/each}
			</select>
			<p class="text-xs text-muted-foreground">
				If a job is linked, the location auto-fills from the job address.
			</p>
		</div>
	{/if}

	<!-- Type -->
	<div class="space-y-1.5">
		<Label for="a-type">Type <span class="text-destructive">*</span></Label>
		<select
			id="a-type"
			bind:value={type}
			class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			{#each TYPES as t (t.value)}
				<option value={t.value}>{t.label}</option>
			{/each}
		</select>
	</div>

	<!-- Title -->
	<div class="space-y-1.5">
		<Label for="a-title">Title <span class="text-destructive">*</span></Label>
		<Input id="a-title" bind:value={title} maxlength={200} />
		{#if fieldErrors.title}
			<p class="text-xs text-destructive">{fieldErrors.title}</p>
		{/if}
	</div>

	<!-- Times -->
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="space-y-1.5">
			<Label for="a-start">Start <span class="text-destructive">*</span></Label>
			<input
				id="a-start"
				type="datetime-local"
				bind:value={scheduledStart}
				class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			{#if fieldErrors.scheduled_start}
				<p class="text-xs text-destructive">{fieldErrors.scheduled_start}</p>
			{/if}
		</div>
		<div class="space-y-1.5">
			<Label for="a-end">End <span class="text-destructive">*</span></Label>
			<input
				id="a-end"
				type="datetime-local"
				bind:value={scheduledEnd}
				class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			{#if fieldErrors.scheduled_end}
				<p class="text-xs text-destructive">{fieldErrors.scheduled_end}</p>
			{/if}
		</div>
	</div>

	<!-- Location -->
	<div class="space-y-1.5">
		<Label for="a-location">Location</Label>
		<Input id="a-location" bind:value={location} maxlength={500} />
	</div>

	<!-- Assignee -->
	{#if canEditAssignee}
		<div class="space-y-1.5">
			<Label for="a-assignee">Assigned to</Label>
			<select
				id="a-assignee"
				bind:value={assignedTo}
				class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">Unassigned</option>
				{#each assignees as a (a.id)}
					<option value={a.id}>{a.full_name}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Notes -->
	<div class="space-y-1.5">
		<Label for="a-notes">Notes</Label>
		<Textarea id="a-notes" bind:value={notes} rows={3} maxlength={5000} />
	</div>

	{#if errorMsg}
		<p class="text-sm text-destructive">{errorMsg}</p>
	{/if}

	<div class="flex gap-2 pt-2">
		<Button type="button" variant="outline" class="flex-1" disabled={saving} onclick={onCancel}>
			Cancel
		</Button>
		<JetEngineButton
			class="flex-1"
			label={submitLabel ?? (mode === 'create' ? 'Create appointment' : 'Save changes')}
			loadingLabel="Saving…"
			successLabel="Saved"
			state={saving ? 'loading' : 'idle'}
			onclick={() => void submit()}
		/>
	</div>
</form>
