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
	import EventFormDialog from './EventFormDialog.svelte';

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
	//  • Job     → a real Job (money/contract) that auto-lands as a green visit on the grid.
	//  • Request → a lead + an on-site assessment: creates a Request row, then books the
	//              assessment (an `appointments` row carrying its `request_id`) on the grid.
	//  • Event   → non-billable team/personal time-block (meeting, holiday, PTO). Customer is
	//              OPTIONAL — it's a separate object (Jobber `Event`), never touches money.
	let tab = $state<'job' | 'request' | 'event'>('job');

	// Customer is required for Job/Request but OPTIONAL for an Event.
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

	// Instructions — collapsed behind "+ Add Instructions" (Request tab only, ref/visit/1-2).
	// Maps to the assessment appointment's `notes`.
	let showInstructions = $state(false);
	let instructions = $state('');

	// Details — always-visible on the Event tab (Jobber ref/event/1). Maps to the event's
	// `description`.
	let eventDescription = $state('');

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
			await saveRequest(trimmed, startIso, endIso);
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

	// Request tab → create a lead + book its on-site assessment (Jobber Request flow).
	// Two sequential calls (matches the New Request page, NOT atomic): first the Request,
	// then the assessment appointment carrying its request_id. The assessment is what
	// renders on the grid (green/blue "Assessment" card).
	async function saveRequest(trimmed: string, startIso: string, endIso: string | null) {
		// 1) Create the Request lead.
		const reqRes = await fetch('/api/requests', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ contact_id: contactId, title: trimmed })
		});

		if (!reqRes.ok) {
			let msg = 'Could not create request.';
			try {
				const body = (await reqRes.json()) as { error?: string };
				if (body?.error) msg = body.error;
			} catch {
				// keep default
			}
			errorMsg = msg;
			throw new Error(msg);
		}

		let requestId: string;
		try {
			const body = (await reqRes.json()) as { data?: { id?: string } };
			requestId = body.data?.id ?? '';
		} catch {
			requestId = '';
		}
		if (!requestId) {
			errorMsg = 'Could not create request.';
			throw new Error(errorMsg);
		}

		// 2) Book the on-site assessment. type is forced to 'estimate' server-side.
		const apptPayload: Record<string, unknown> = {
			contact_id: contactId,
			request_id: requestId,
			type: 'estimate',
			title: trimmed,
			all_day: isAnytime,
			scheduled_start: startIso,
			scheduled_end: endIso,
			notes: instructions.trim() || null
		};
		if (canEditAssignee && selectedIds.length > 0) {
			apptPayload.assignee_ids = selectedIds;
			apptPayload.lead_member_id = leadId;
		}

		const apptRes = await fetch('/api/appointments', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(apptPayload)
		});

		if (apptRes.status === 201) {
			onCreated?.();
			onClose();
			return;
		}

		// The Request was created but the assessment failed — surface it, don't roll back
		// (matches the New Request page's partial-failure stance).
		let msg = 'Request created, but the assessment could not be scheduled — open it from Requests.';
		try {
			const body = (await apptRes.json()) as { error?: string };
			if (apptRes.status === 409) msg = 'That time conflicts with another visit for the assignee.';
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
		// Jobber's event quick-create collects only title, details, schedule — no customer,
		// no crew (both live in the fuller editor / More Options).
		const payload: Record<string, unknown> = {
			title: trimmed,
			description: eventDescription.trim() || null,
			all_day: isAnytime,
			start_at: startIso,
			end_at: endIso
		};

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

	// Event "More options" → the full New Event modal (Jobber ref/event/2), seeded from
	// what's filled in. Unlike Job/Request (which navigate to a full page), an Event opens
	// a centered modal (portalled to body, survives inside this draggable popover).
	let eventModalOpen = $state(false);
	let eventSeedStart = $state<Date | null>(null);
	let eventSeedEnd = $state<Date | null>(null);
	let eventSeedAllDay = $state(false);

	function openEventModal() {
		if (isAnytime) {
			eventSeedStart = anytimeDate ? new Date(`${anytimeDate}T12:00:00`) : null;
			eventSeedEnd = null;
			eventSeedAllDay = true;
		} else {
			eventSeedStart = scheduledStart ? new Date(scheduledStart) : null;
			eventSeedEnd = scheduledEnd ? new Date(scheduledEnd) : null;
			eventSeedAllDay = false;
		}
		eventModalOpen = true;
	}

	// "More options" → the full create page for the active tab, carrying what's filled in.
	function moreOptions() {
		if (tab === 'event') {
			openEventModal();
			return;
		}
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

		// Request tab → the full New Request page, carrying title + client + schedule.
		const params = new URLSearchParams();
		if (isAnytime) {
			params.set('all_day', '1');
			if (anytimeDate) params.set('start', new Date(`${anytimeDate}T12:00:00`).toISOString());
		} else {
			if (scheduledStart) params.set('start', new Date(scheduledStart).toISOString());
			if (scheduledEnd) params.set('end', new Date(scheduledEnd).toISOString());
		}
		if (title.trim()) params.set('title', title.trim());
		if (instructions.trim()) params.set('instructions', instructions.trim());
		if (contactId) {
			params.set('contact_id', contactId);
			params.set('contact_name', contactName);
		}
		onClose();
		void goto(`/requests/new?${params.toString()}`);
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
		tab === 'job' ? 'Save job' : tab === 'event' ? 'Save event' : 'Save request'
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
			class:quick-create__tab--active={tab === 'request'}
			aria-selected={tab === 'request'}
			onclick={() => {
				tab = 'request';
				errorMsg = null;
			}}
		>
			Request
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
		     for Job/Request. An Event has NO customer field (Jobber ref/event/1). -->
		{#if tab !== 'event'}
			<ContactPicker
				bind:selected={selectedContact}
				placeholder="Search customer…"
				onSelect={() => (errorMsg = null)}
			/>
		{/if}

		<!-- Title -->
		<input
			class="field__input"
			placeholder={titlePlaceholder}
			bind:value={title}
			maxlength={200}
			{@attach autofocus}
			oninput={() => (errorMsg = null)}
		/>

		<!-- Details (Event tab) — always-visible textarea, maps to the event's description
		     (Jobber ref/event/1 shows "Details" open by default on the Event tab). -->
		{#if tab === 'event'}
			<textarea
				class="quick-create__instructions"
				placeholder="Details"
				rows="3"
				bind:value={eventDescription}
			></textarea>
		{/if}

		<!-- Instructions (Request tab only) — collapsed behind "+ Add Instructions" like Jobber. -->
		{#if tab === 'request'}
			{#if showInstructions}
				<textarea
					class="quick-create__instructions"
					placeholder="Instructions"
					rows="3"
					bind:value={instructions}
				></textarea>
			{:else}
				<button
					type="button"
					class="quick-create__add"
					onclick={() => (showInstructions = true)}
				>
					<i class="ri-add-line" aria-hidden="true"></i> Add Instructions
				</button>
			{/if}
		{/if}

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

		<!-- Assign (collapsed like Jobber) — not shown for Events (Jobber's event quick-create
		     has no crew picker; assignment lives in the fuller editor). -->
		{#if canEditAssignee && tab !== 'event'}
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
			<button type="button" class="quick-create__more" onclick={moreOptions}>More options</button>
			<Button loadingLabel="Saving…" successLabel="Saved" size="sm" onAction={save}>
				{saveLabel}
			</Button>
		</div>
	</div>

	<!-- Event "More options" → full New Event modal. On save it revalidates and closes the
	     quick popover; cancelling just returns to the popover. -->
	<EventFormDialog
		bind:open={eventModalOpen}
		mode="new"
		seedStart={eventSeedStart}
		seedEnd={eventSeedEnd}
		seedAllDay={eventSeedAllDay}
		seedTitle={title.trim()}
		seedDescription={eventDescription.trim()}
		onSaved={() => {
			onCreated?.();
			onClose();
		}}
	/>
</DraggablePanel>
