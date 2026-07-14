<script lang="ts">
	import { goto } from '$app/navigation';
	import { dateTimeLocalValue } from '$lib/utils/calendar';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import ContactPicker from '$lib/components/shared/ContactPicker.svelte';
	import type { ContactHit } from '$lib/components/shared/contactPicker';
	import DraggablePanel from '$lib/components/shared/DraggablePanel.svelte';
	import CrewPicker from './CrewPicker.svelte';

	type Assignee = { id: string; full_name: string };

	let {
		start,
		end,
		allDay = false,
		point = null,
		assignees = [],
		canEditAssignee = false,
		onClose,
		onCreated
	}: {
		start: Date;
		end: Date;
		// Anytime create (from the Anytime lane): seed the toggle on.
		allDay?: boolean;
		// Screen point of the originating click — the bubble opens near it, then drags.
		point?: { x: number; y: number } | null;
		assignees?: Assignee[];
		canEditAssignee?: boolean;
		onClose: () => void;
		// Fired after a successful inline create so the calendar can revalidate.
		onCreated?: () => void;
	} = $props();

	// Three entity tabs (Jobber / Housecall Pro pattern):
	//  • Job   → a real Job (money/contract) that auto-lands as a green visit on the grid.
	//  • Visit → a standalone appointment (estimate / callback / inspection), no Job needed.
	//  • Event → non-billable team/personal time-block (meeting, holiday, PTO). Customer is
	//            OPTIONAL — it's a separate object (Jobber `Event`), never touches money.
	let tab = $state<'job' | 'visit' | 'event'>('job');

	// Customer is required for Job/Visit but OPTIONAL for an Event.
	const contactRequired = $derived(tab !== 'event');

	// --- Shared form state ----------------------------------------------------
	let title = $state('');
	// The picked client — the shared ContactPicker owns its own search UI/state.
	let selectedContact = $state<ContactHit | null>(null);
	const contactId = $derived(selectedContact?.id ?? '');
	const contactName = $derived(selectedContact?.full_name ?? '');
	let errorMsg = $state<string | null>(null);

	// Schedule — seeded from the drag/click, editable in the bubble.
	let isAnytime = $state(allDay);
	let scheduledStart = $state(dateTimeLocalValue(start));
	let scheduledEnd = $state(dateTimeLocalValue(end));
	let anytimeDate = $state((dateTimeLocalValue(start) || '').split('T')[0]);

	// Crew — collapsed behind "+ Assign" like Jobber.
	let showAssign = $state(false);
	let selectedIds = $state<string[]>([]);
	let leadId = $state<string | null>(null);

	// --- Schedule helper ------------------------------------------------------
	// Resolves the bubble's schedule inputs into ISO start/end, or throws a
	// user-facing message on invalid input. Shared by both tabs.
	function resolveSchedule(): { startIso: string; endIso: string | null } {
		if (isAnytime) {
			if (!anytimeDate) throw new Error('Pick a date.');
			// Anchor at noon so the day bucket is timezone-safe (matches AppointmentForm).
			return { startIso: new Date(`${anytimeDate}T12:00:00`).toISOString(), endIso: null };
		}
		if (!scheduledStart || !scheduledEnd) throw new Error('Start and end times are required.');
		const s = new Date(scheduledStart);
		const e = new Date(scheduledEnd);
		if (e.getTime() <= s.getTime()) throw new Error('End time must be after start time.');
		return { startIso: s.toISOString(), endIso: e.toISOString() };
	}

	// --- Save -----------------------------------------------------------------
	async function save() {
		errorMsg = null;
		const trimmed = title.trim();
		if (!trimmed) {
			errorMsg = 'Add a title.';
			return;
		}
		if (contactRequired && !contactId) {
			errorMsg = 'Pick a customer.';
			return;
		}

		let startIso: string;
		let endIso: string | null;
		try {
			({ startIso, endIso } = resolveSchedule());
		} catch (err) {
			errorMsg = (err as Error).message;
			return;
		}

		if (tab === 'job') {
			await saveJob(trimmed, startIso, endIso);
		} else if (tab === 'event') {
			await saveEvent(trimmed, startIso, endIso);
		} else {
			await saveVisit(trimmed, startIso, endIso);
		}
	}

	// Job tab → create a REAL Job. A one-off job with a start auto-materializes its
	// "job_start" visit on the calendar (green), so it appears on the grid on revalidate.
	async function saveJob(trimmed: string, startIso: string, endIso: string | null) {
		const payload: Record<string, unknown> = {
			contact_id: contactId,
			title: trimmed,
			scheduled_start: startIso,
			scheduled_end: endIso
		};
		// Jobs carry a single assignee — map the crew lead (or first picked) onto it.
		if (canEditAssignee) {
			const who = leadId ?? selectedIds[0] ?? null;
			if (who) payload.assigned_to = who;
		}

		const res = await fetch('/api/jobs', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.status === 201) {
			onCreated?.();
			onClose();
			return;
		}

		let msg = 'Could not create job.';
		try {
			const body = (await res.json()) as { error?: string };
			if (body?.error) msg = body.error;
		} catch {
			// keep default
		}
		errorMsg = msg;
		// Throw so Button drops out of its loading state.
		throw new Error(msg);
	}

	// Visit tab → create a standalone appointment (estimate / callback / inspection).
	async function saveVisit(trimmed: string, startIso: string, endIso: string | null) {
		const payload: Record<string, unknown> = {
			contact_id: contactId,
			// Neutral default; matches the full form. Change it on the detail page.
			type: 'estimate',
			title: trimmed,
			all_day: isAnytime,
			scheduled_start: startIso,
			scheduled_end: endIso
		};
		if (canEditAssignee && selectedIds.length > 0) {
			payload.assignee_ids = selectedIds;
			payload.lead_member_id = leadId;
		}

		const res = await fetch('/api/appointments', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.status === 201) {
			onCreated?.();
			onClose();
			return;
		}

		let msg = 'Could not create visit.';
		try {
			const body = (await res.json()) as { error?: string };
			if (res.status === 409) msg = 'That time conflicts with another visit for the assignee.';
			else if (body?.error) msg = body.error;
		} catch {
			// keep default
		}
		errorMsg = msg;
		// Throw so Button drops out of its loading state.
		throw new Error(msg);
	}

	// Event tab → create a non-billable calendar Event (Jobber `Event`): a time block
	// with no money and an OPTIONAL customer. Posts to /api/events (note: start_at/end_at,
	// no `type`, no conflict block).
	async function saveEvent(trimmed: string, startIso: string, endIso: string | null) {
		const payload: Record<string, unknown> = {
			title: trimmed,
			all_day: isAnytime,
			start_at: startIso,
			end_at: endIso
		};
		// Customer is optional on an Event — only send it if one was picked.
		if (contactId) payload.contact_id = contactId;
		if (canEditAssignee && selectedIds.length > 0) {
			payload.assignee_ids = selectedIds;
			payload.lead_member_id = leadId;
		}

		const res = await fetch('/api/events', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.status === 201) {
			onCreated?.();
			onClose();
			return;
		}

		let msg = 'Could not create event.';
		try {
			const body = (await res.json()) as { error?: string };
			if (body?.error) msg = body.error;
		} catch {
			// keep default
		}
		errorMsg = msg;
		// Throw so Button drops out of its loading state.
		throw new Error(msg);
	}

	// "More options" → the full create page for the active tab, carrying what's filled in.
	function moreOptions() {
		if (tab === 'job') {
			// The job form re-collects contact + schedule; carry the title as a light hint.
			const params = new URLSearchParams();
			if (contactId) {
				params.set('contact_id', contactId);
				params.set('contact_name', contactName);
			}
			if (title.trim()) params.set('title', title.trim());
			onClose();
			void goto(`/jobs/new?${params.toString()}`);
			return;
		}

		const params = new URLSearchParams();
		if (isAnytime) {
			params.set('all_day', '1');
			if (anytimeDate) params.set('start', new Date(`${anytimeDate}T12:00:00`).toISOString());
		} else {
			if (scheduledStart) params.set('start', new Date(scheduledStart).toISOString());
			if (scheduledEnd) params.set('end', new Date(scheduledEnd).toISOString());
		}
		if (title.trim()) params.set('title', title.trim());
		if (contactId) {
			params.set('contact_id', contactId);
			params.set('contact_name', contactName);
		}
		onClose();
		void goto(`/appointments/new?${params.toString()}`);
	}

	// Autofocus the title on open.
	function autofocus(node: HTMLElement) {
		node.focus();
	}

	const titlePlaceholder = $derived(
		tab === 'job'
			? 'Title (e.g. Fence install at 12 Oak St)'
			: tab === 'event'
				? 'Title (e.g. Team meeting)'
				: 'Title (e.g. Estimate at 12 Oak St)'
	);
	const saveLabel = $derived(
		tab === 'job' ? 'Save job' : tab === 'event' ? 'Save event' : 'Save visit'
	);
</script>

<DraggablePanel {point} ariaLabel="Create" {onClose}>
	{#snippet heading()}New{/snippet}

	<!-- Entity tabs -->
	<div class="quick-create__tabs" role="tablist">
		<button
			type="button"
			role="tab"
			class="quick-create__tab"
			class:quick-create__tab--active={tab === 'job'}
			aria-selected={tab === 'job'}
			onclick={() => {
				tab = 'job';
				errorMsg = null;
			}}
		>
			Job
		</button>
		<button
			type="button"
			role="tab"
			class="quick-create__tab"
			class:quick-create__tab--active={tab === 'visit'}
			aria-selected={tab === 'visit'}
			onclick={() => {
				tab = 'visit';
				errorMsg = null;
			}}
		>
			Visit
		</button>
		<button
			type="button"
			role="tab"
			class="quick-create__tab"
			class:quick-create__tab--active={tab === 'event'}
			aria-selected={tab === 'event'}
			onclick={() => {
				tab = 'event';
				errorMsg = null;
			}}
		>
			Event
		</button>
	</div>

	<div class="quick-create__form">
		<!-- Customer — shared robust picker (search icon, spinner, recent-on-focus). Required
		     for Job/Visit, OPTIONAL for an Event. -->
		<ContactPicker
			bind:selected={selectedContact}
			placeholder={contactRequired ? 'Search customer…' : 'Search customer (optional)…'}
			onSelect={() => (errorMsg = null)}
		/>

		<!-- Title -->
		<input
			class="field__input"
			placeholder={titlePlaceholder}
			bind:value={title}
			maxlength={200}
			{@attach autofocus}
			oninput={() => (errorMsg = null)}
		/>

		<!-- Anytime toggle -->
		<div class="quick-create__anytime">
			<label class="quick-create__anytime-label" for="qc-anytime">Anytime</label>
			<Switch id="qc-anytime" bind:checked={isAnytime} />
		</div>

		<!-- Schedule -->
		{#if isAnytime}
			<Calendar bind:value={anytimeDate} placeholder="Pick a date" />
		{:else}
			<div class="quick-create__times">
				<DateTimePicker bind:value={scheduledStart} placeholder="Start" />
				<DateTimePicker bind:value={scheduledEnd} placeholder="End" />
			</div>
		{/if}

		<!-- Assign (collapsed like Jobber) -->
		{#if canEditAssignee}
			{#if showAssign}
				<CrewPicker {assignees} bind:selectedIds bind:leadId />
			{:else}
				<button type="button" class="quick-create__add" onclick={() => (showAssign = true)}>
					<i class="ri-user-add-line" aria-hidden="true"></i> Assign
				</button>
			{/if}
		{/if}

		{#if errorMsg}
			<p class="quick-create__error">{errorMsg}</p>
		{/if}

		<div class="quick-create__footer">
			<!-- Events have no full-page create form yet (later phase) — hide "More options". -->
			{#if tab !== 'event'}
				<button type="button" class="quick-create__more" onclick={moreOptions}>More options</button>
			{:else}
				<span></span>
			{/if}
			<Button loadingLabel="Saving…" successLabel="Saved" size="sm" onAction={save}>
				{saveLabel}
			</Button>
		</div>
	</div>
</DraggablePanel>
