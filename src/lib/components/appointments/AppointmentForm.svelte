<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import ContactPicker from '$lib/components/shared/ContactPicker.svelte';
	import type { ContactHit } from '$lib/components/shared/contactPicker';
	import CrewPicker from './CrewPicker.svelte';
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
		initialStart,
		initialEnd,
		initialAllDay = false,
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
		initialStart?: string | null;
		initialEnd?: string | null;
		// Seed the Anytime toggle on (create-from-Anytime-lane). Ignored in edit mode.
		initialAllDay?: boolean;
		submitLabel?: string;
		onCancel: () => void;
		onSubmit: (
			payload: Record<string, unknown>
		) => Promise<{ ok: boolean; error?: string; field_errors?: Record<string, string> }>;
	} = $props();

	// Selected client — the shared ContactPicker owns the search UI/state. Seeded from
	// initialContact (create-from-contact); in edit mode the contact is locked and shown
	// read-only, so the picker never mounts and `appointment` drives the derived name.
	let selectedContact = $state<ContactHit | null>(
		initialContact
			? { id: initialContact.id, full_name: initialContact.full_name, phone: null, email: null }
			: null
	);
	const contactId = $derived(appointment?.contact_id ?? selectedContact?.id ?? '');
	const contactName = $derived(appointment?.contact_name ?? selectedContact?.full_name ?? '');

	// Derived from props but reassignable (Svelte 5 override) — the contact-pick handlers
	// reset the linked job and refill its options, exactly as the pre-migration form did.
	let jobId = $derived(appointment?.job_id ?? initialJob?.id ?? '');
	let jobOptions = $derived<JobOption[]>(
		initialJob
			? [initialJob]
			: appointment?.job_id && appointment.job_title
				? [{ id: appointment.job_id, title: appointment.job_title, status: 'scheduled' }]
				: []
	);

	let type = $derived<AppointmentType>(appointment?.type ?? 'estimate');
	let title = $derived(appointment?.title ?? '');
	let scheduledStart = $state(
		dateTimeLocalValue(appointment?.scheduled_start ?? initialStart ?? null)
	);
	let scheduledEnd = $state(dateTimeLocalValue(appointment?.scheduled_end ?? initialEnd ?? null));

	// "Anytime" visit — a date with no clock time (Jobber/Housecall Pro). When on, the
	// Start/End pickers are replaced by a single date picker and the API stores no end time.
	let allDay = $state(appointment?.all_day ?? initialAllDay);
	let anytimeDate = $state(
		(dateTimeLocalValue(appointment?.scheduled_start ?? initialStart ?? null) || '').split('T')[0]
	);
	let location = $derived(appointment?.location ?? '');
	let notes = $derived(appointment?.notes ?? '');

	// Multi-assignee state. Initialized from the detail payload (edit mode) or
	// empty (create). The lead is whichever member has is_lead = true; if the
	// caller has no edit rights, these stay frozen at the initial values.
	const initialAssignees = appointment?.assignees ?? [];
	let selectedIds = $state<string[]>(initialAssignees.map((a) => a.id));
	let leadId = $state<string | null>(
		initialAssignees.find((a) => a.is_lead)?.id ?? initialAssignees[0]?.id ?? null
	);

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	// ContactPicker callbacks: on pick, reset any linked job and reload the client's jobs;
	// on clear, drop the job link and its options.
	async function onSelectContact(c: ContactHit) {
		jobId = '';
		await loadJobsForContact(c.id);
	}

	function onClearContact() {
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

		let payloadStart: string;
		let payloadEnd: string | null = null;
		if (allDay) {
			if (!anytimeDate) {
				fieldErrors.scheduled_start = 'Pick a date.';
				return;
			}
			// Anchor at noon so the visit's calendar day is timezone-safe when bucketed.
			payloadStart = new Date(`${anytimeDate}T12:00:00`).toISOString();
		} else {
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
			payloadStart = startDate.toISOString();
			payloadEnd = endDate.toISOString();
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = {
				type,
				title: title.trim(),
				all_day: allDay,
				scheduled_start: payloadStart,
				scheduled_end: payloadEnd,
				location: location.trim() || null,
				notes: notes.trim() || null
			};
			if (mode === 'create') {
				payload.contact_id = contactId;
				payload.job_id = jobId || null;
			}
			if (canEditAssignee) {
				payload.assignee_ids = selectedIds;
				payload.lead_member_id = selectedIds.length > 0 ? leadId : null;
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
	class="appt-form"
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
>
	<!-- Contact -->
	<div class="field">
		<label class="field__label field__label--required" for="a-contact">Contact</label>
		{#if mode === 'edit'}
			<input id="a-contact" class="field__input" value={contactName} disabled />
		{:else}
			<ContactPicker
				bind:selected={selectedContact}
				placeholder="Search contacts by name, phone, or email…"
				onSelect={onSelectContact}
				onClear={onClearContact}
			/>
		{/if}
	</div>

	<!-- Job (optional) -->
	{#if mode === 'create' && contactId && jobOptions.length > 0}
		<div class="field">
			<label class="field__label" for="a-job">Linked job (optional)</label>
			<Select.Root bind:value={jobId}>
				<Select.Trigger>
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">No job</Select.Item>
					{#each jobOptions as j (j.id)}
						<Select.Item value={j.id}>{j.title}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<p class="field__hint">If a job is linked, the location auto-fills from the job address.</p>
		</div>
	{/if}

	<!-- Type -->
	<div class="field">
		<span class="field__label field__label--required">Type</span>
		<Select.Root bind:value={type}>
			<Select.Trigger>
				<Select.Value />
			</Select.Trigger>
			<Select.Content>
				{#each TYPES as t (t.value)}
					<Select.Item value={t.value}>{t.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Title -->
	<div class="field">
		<label class="field__label field__label--required" for="a-title">Title</label>
		<input id="a-title" class="field__input" bind:value={title} maxlength={200} />
		{#if fieldErrors.title}
			<p class="field__error">{fieldErrors.title}</p>
		{/if}
	</div>

	<!-- Anytime toggle: date-only visit with no specific clock time -->
	<div class="appt-form__anytime">
		<div class="appt-form__anytime-text">
			<label class="appt-form__anytime-label" for="a-anytime">Anytime</label>
			<span class="appt-form__anytime-hint">
				No specific time — sits in the calendar's Anytime row for that day.
			</span>
		</div>
		<Switch id="a-anytime" bind:checked={allDay} />
	</div>

	<!-- Times (or date-only for Anytime) -->
	{#if allDay}
		<div class="field">
			<span class="field__label field__label--required">Date</span>
			<Calendar bind:value={anytimeDate} placeholder="Pick a date" />
			{#if fieldErrors.scheduled_start}
				<p class="field__error">{fieldErrors.scheduled_start}</p>
			{/if}
		</div>
	{:else}
		<div class="appt-form__times">
			<div class="field">
				<span class="field__label field__label--required">Start</span>
				<DateTimePicker bind:value={scheduledStart} placeholder="Pick start date & time" />
				{#if fieldErrors.scheduled_start}
					<p class="field__error">{fieldErrors.scheduled_start}</p>
				{/if}
			</div>
			<div class="field">
				<span class="field__label field__label--required">End</span>
				<DateTimePicker bind:value={scheduledEnd} placeholder="Pick end date & time" />
				{#if fieldErrors.scheduled_end}
					<p class="field__error">{fieldErrors.scheduled_end}</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Location -->
	<div class="field">
		<label class="field__label" for="a-location">Location</label>
		<input id="a-location" class="field__input" bind:value={location} maxlength={500} />
	</div>

	<!-- Crew (multi-assignee + lead) -->
	{#if canEditAssignee}
		<div class="field">
			<span class="field__label">Crew</span>
			<p class="field__hint">Tap a member to add them. Tap the crown to set the lead.</p>
			<CrewPicker {assignees} bind:selectedIds bind:leadId />
		</div>
	{/if}

	<!-- Notes -->
	<div class="field">
		<label class="field__label" for="a-notes">Notes</label>
		<textarea id="a-notes" class="field__textarea" bind:value={notes} rows={3} maxlength={5000}
		></textarea>
	</div>

	{#if errorMsg}
		<p class="appt-form__error">{errorMsg}</p>
	{/if}

	<div class="appt-form__actions">
		<Button variant="outline" class="btn--full" disabled={saving} onclick={onCancel}>
			Cancel
		</Button>
		<Button
			class="btn--full"
			loadingLabel="Saving…"
			successLabel="Saved"
			loading={saving}
			onclick={() => void submit()}
		>
			{submitLabel ?? (mode === 'create' ? 'Create appointment' : 'Save changes')}
		</Button>
	</div>
</form>
