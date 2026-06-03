<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { dateTimeLocalValue } from '$lib/utils/calendar';
	import { cn } from '$lib/utils/cn';
	import { Check, Crown } from '@lucide/svelte';
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

	function toggleAssignee(memberId: string) {
		if (selectedIds.includes(memberId)) {
			selectedIds = selectedIds.filter((id) => id !== memberId);
			if (leadId === memberId) leadId = selectedIds[0] ?? null;
		} else {
			selectedIds = [...selectedIds, memberId];
			if (leadId === null) leadId = memberId;
		}
	}

	function setLead(memberId: string) {
		if (!selectedIds.includes(memberId)) {
			selectedIds = [...selectedIds, memberId];
		}
		leadId = memberId;
	}

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
			<Select.Root bind:value={jobId}>
				<Select.Trigger class="h-11 w-full">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">No job</Select.Item>
					{#each jobOptions as j (j.id)}
						<Select.Item value={j.id}>{j.title}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<p class="text-xs text-muted-foreground">
				If a job is linked, the location auto-fills from the job address.
			</p>
		</div>
	{/if}

	<!-- Type -->
	<div class="space-y-1.5">
		<Label for="a-type">Type <span class="text-destructive">*</span></Label>
		<Select.Root bind:value={type}>
			<Select.Trigger class="h-11 w-full">
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
			<Label>Start <span class="text-destructive">*</span></Label>
			<DateTimePicker bind:value={scheduledStart} placeholder="Pick start date & time" />
			{#if fieldErrors.scheduled_start}
				<p class="text-xs text-destructive">{fieldErrors.scheduled_start}</p>
			{/if}
		</div>
		<div class="space-y-1.5">
			<Label>End <span class="text-destructive">*</span></Label>
			<DateTimePicker bind:value={scheduledEnd} placeholder="Pick end date & time" />
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

	<!-- Crew (multi-assignee + lead) -->
	{#if canEditAssignee}
		<div class="space-y-1.5">
			<Label>Crew</Label>
			<p class="text-xs text-muted-foreground">
				Tap a member to add them. Tap the crown to set the lead.
			</p>
			{#if assignees.length === 0}
				<p
					class="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground"
				>
					No team members available.
				</p>
			{:else}
				<ul class="divide-y divide-border rounded-md border border-border bg-card">
					{#each assignees as a (a.id)}
						{@const selected = selectedIds.includes(a.id)}
						{@const isLead = leadId === a.id && selected}
						<li class="flex items-center gap-2 px-2 py-1.5">
							<button
								type="button"
								onclick={() => toggleAssignee(a.id)}
								class={cn(
									'flex min-h-11 flex-1 items-center gap-3 rounded-md px-2 text-left transition-colors',
									selected ? 'bg-primary/5' : 'hover:bg-accent/40 active:bg-accent/60'
								)}
								aria-pressed={selected}
							>
								<span
									class={cn(
										'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
										selected
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-input bg-background'
									)}
								>
									{#if selected}
										<Check class="h-4 w-4" />
									{/if}
								</span>
								<span class="flex-1 text-sm text-foreground">{a.full_name}</span>
								{#if isLead}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
									>
										<Crown class="h-3 w-3" /> Lead
									</span>
								{/if}
							</button>
							<button
								type="button"
								onclick={() => setLead(a.id)}
								disabled={isLead}
								aria-label={isLead ? `${a.full_name} is lead` : `Make ${a.full_name} the lead`}
								class={cn(
									'flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors',
									isLead
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/80'
								)}
							>
								<Crown class="h-4 w-4" />
							</button>
						</li>
					{/each}
				</ul>
				<p class="text-xs text-muted-foreground">
					{selectedIds.length === 0
						? 'No crew assigned.'
						: selectedIds.length === 1
							? '1 member · lead set'
							: `${selectedIds.length} members · lead set`}
				</p>
			{/if}
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
