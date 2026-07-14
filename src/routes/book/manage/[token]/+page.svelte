<script lang="ts">
	import { onMount } from 'svelte';
	import Calendar from '$lib/components/booking/Calendar.svelte';
	import TimeSlots from '$lib/components/booking/TimeSlots.svelte';
	import { formatInOrgTz } from '$lib/utils/formatInOrgTz';

	type View = {
		org_name: string;
		org_timezone: string;
		contact_first_name: string;
		type: string;
		title: string;
		scheduled_start: string;
		scheduled_end: string | null;
		location: string | null;
		can_reschedule: boolean;
		org_slug: string | null;
		booking_slug: string | null;
		slot_duration_minutes: number | null;
	};

	let { data }: { data: { token: string } } = $props();
	let token = $state(data.token);

	let view = $state<View | null>(null);
	let loading = $state(true);
	let notFound = $state(false);
	let mode = $state<'view' | 'reschedule' | 'confirm_cancel' | 'cancelled' | 'rescheduled'>('view');

	let month = $state<string>('');
	let availableDatesByMonth = $state<Map<string, Set<string>>>(new Map());
	let datesLoading = $state(false);
	let selectedDate = $state<string | null>(null);
	let slots = $state<string[]>([]);
	let slotsLoading = $state(false);
	let selectedSlot = $state<string | null>(null);
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	const apiBase = $derived(`/api/public/appointments/manage/${token}`);
	const bookingBase = $derived(
		view?.org_slug && view?.booking_slug
			? `/api/public/booking/${view.org_slug}/${view.booking_slug}`
			: null
	);

	const availableDatesForMonth = $derived(availableDatesByMonth.get(month) ?? new Set<string>());

	const startLabel = $derived(
		view
			? formatInOrgTz(view.scheduled_start, view.org_timezone, {
					weekday: 'long',
					month: 'long',
					day: 'numeric',
					year: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					timeZoneName: 'short'
				})
			: ''
	);

	const selectedSlotLabel = $derived(
		selectedSlot && view
			? formatInOrgTz(selectedSlot, view.org_timezone, {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);

	const selectedDateLabel = $derived(
		selectedDate
			? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
					weekday: 'long',
					month: 'long',
					day: 'numeric',
					timeZone: 'UTC'
				})
			: ''
	);

	onMount(loadView);

	async function loadView() {
		loading = true;
		notFound = false;
		try {
			const res = await fetch(apiBase, { headers: { accept: 'application/json' } });
			if (!res.ok) {
				notFound = true;
				return;
			}
			const body = await res.json();
			view = body.data as View;
			month = currentMonthInTz(view.org_timezone);
		} catch {
			notFound = true;
		} finally {
			loading = false;
		}
	}

	function currentMonthInTz(tz: string): string {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit'
		}).format(new Date());
	}

	async function loadDates(targetMonth: string) {
		if (!bookingBase) return;
		if (availableDatesByMonth.has(targetMonth)) return;
		datesLoading = true;
		try {
			const res = await fetch(`${bookingBase}/dates?month=${targetMonth}`);
			const next = new Map(availableDatesByMonth);
			if (res.ok) {
				const body = await res.json();
				const dates: string[] = body.data?.dates ?? [];
				next.set(targetMonth, new Set(dates));
			} else {
				next.set(targetMonth, new Set());
			}
			availableDatesByMonth = next;
		} catch {
			const next = new Map(availableDatesByMonth);
			next.set(targetMonth, new Set());
			availableDatesByMonth = next;
		} finally {
			datesLoading = false;
		}
	}

	async function loadSlots(date: string) {
		if (!bookingBase) return;
		slotsLoading = true;
		try {
			const res = await fetch(`${bookingBase}/slots?date=${date}`);
			if (!res.ok) {
				slots = [];
				return;
			}
			const body = await res.json();
			slots = body.data?.slots ?? [];
		} catch {
			slots = [];
		} finally {
			slotsLoading = false;
		}
	}

	async function startReschedule() {
		errorMsg = null;
		mode = 'reschedule';
		if (view && availableDatesByMonth.size === 0) {
			await loadDates(month);
		}
	}

	async function handleMonthChange(newMonth: string) {
		month = newMonth;
		await loadDates(newMonth);
	}

	async function handleSelectDate(date: string) {
		selectedDate = date;
		selectedSlot = null;
		slots = [];
		await loadSlots(date);
	}

	function handleSelectSlot(iso: string) {
		selectedSlot = iso;
	}

	async function confirmReschedule() {
		if (!selectedSlot) return;
		submitting = true;
		errorMsg = null;
		try {
			const res = await fetch(apiBase, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scheduled_start: selectedSlot })
			});
			const body = await res.json().catch(() => ({}));
			if (res.status === 409) {
				errorMsg = body.error ?? 'That time was just taken — please pick another.';
				if (selectedDate) await loadSlots(selectedDate);
				selectedSlot = null;
				return;
			}
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not reschedule. Please try again.';
				return;
			}
			const data = body.data as View & { token: string };
			view = data;
			token = data.token;
			selectedDate = null;
			selectedSlot = null;
			slots = [];
			availableDatesByMonth = new Map();
			mode = 'rescheduled';
		} catch {
			errorMsg = 'Could not reschedule. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function confirmCancel() {
		submitting = true;
		errorMsg = null;
		try {
			const res = await fetch(apiBase, { method: 'DELETE' });
			if (res.status === 204) {
				mode = 'cancelled';
				return;
			}
			const body = await res.json().catch(() => ({}));
			errorMsg = body.error ?? 'Could not cancel. Please try again.';
		} catch {
			errorMsg = 'Could not cancel. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function backToView() {
		mode = 'view';
		errorMsg = null;
		selectedDate = null;
		selectedSlot = null;
		slots = [];
	}
</script>

<svelte:head>
	<title>Manage your appointment</title>
</svelte:head>

<main class="book-manage">
	{#if loading}
		<div class="book-manage__skeleton">
			<div class="book-manage__skel-title"></div>
			<div class="book-manage__skel-card"></div>
		</div>
	{:else if notFound || !view}
		<div class="book-manage__status">
			<div class="book-manage__status-icon book-manage__status-icon--warning">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
			</div>
			<h1 class="book-manage__status-title">Link no longer works</h1>
			<p class="book-manage__status-text">
				This appointment link is invalid, expired, or has been updated. If you still need to make a
				change, please contact the business directly.
			</p>
		</div>
	{:else if mode === 'cancelled'}
		<div class="book-manage__status">
			<div class="book-manage__status-icon book-manage__status-icon--danger">
				<i class="ri-close-circle-line" aria-hidden="true"></i>
			</div>
			<h1 class="book-manage__status-title">Appointment cancelled</h1>
			<p class="book-manage__status-text">
				Your {view.type.replaceAll('_', ' ')} with {view.org_name} has been cancelled. We've let the
				team know.
			</p>
		</div>
	{:else}
		<header class="book-manage__header">
			<p class="book-manage__org">{view.org_name}</p>
			<h1 class="book-manage__title">
				{mode === 'rescheduled' ? "You're all set" : 'Manage your appointment'}
			</h1>
			{#if view.contact_first_name}
				<p class="book-manage__lead">Hi {view.contact_first_name} — review the details below.</p>
			{/if}
		</header>

		<section class="book-manage__card">
			{#if mode === 'view' || mode === 'rescheduled'}
				{#if mode === 'rescheduled'}
					<div class="book-manage__success-bar">
						<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
						<p>Your new time is locked in.</p>
					</div>
				{/if}

				<div class="book-manage__meta">
					<div class="book-manage__meta-row">
						<div class="book-manage__meta-icon book-manage__meta-icon--brand">
							<i class="ri-calendar-event-line" aria-hidden="true"></i>
						</div>
						<div>
							<p class="book-manage__meta-label">When</p>
							<p class="book-manage__meta-value">{startLabel}</p>
						</div>
					</div>
					<div class="book-manage__meta-row">
						<div class="book-manage__meta-icon">
							<i class="ri-time-line" aria-hidden="true"></i>
						</div>
						<div>
							<p class="book-manage__meta-label">What</p>
							<p class="book-manage__meta-value">
								{view.title} ({view.type.replaceAll('_', ' ')})
							</p>
						</div>
					</div>
					{#if view.location}
						<div class="book-manage__meta-row">
							<div class="book-manage__meta-icon">
								<i class="ri-map-pin-line" aria-hidden="true"></i>
							</div>
							<div>
								<p class="book-manage__meta-label">Where</p>
								<p class="book-manage__meta-value">{view.location}</p>
							</div>
						</div>
					{/if}
				</div>

				<div class="book-manage__actions">
					{#if view.can_reschedule}
						<button type="button" onclick={startReschedule} class="book-manage__reschedule-btn">
							Reschedule
						</button>
					{/if}
					<button
						type="button"
						onclick={() => (mode = 'confirm_cancel')}
						class="book-manage__cancel-btn"
					>
						Cancel appointment
					</button>
				</div>
				{#if !view.can_reschedule}
					<p class="book-manage__no-reschedule">
						To reschedule, please contact {view.org_name} directly.
					</p>
				{/if}
			{:else if mode === 'reschedule'}
				<button type="button" onclick={backToView} class="book-manage__back">
					<i class="ri-arrow-left-s-line" aria-hidden="true"></i> Back
				</button>

				{#if !selectedDate}
					<Calendar
						{month}
						availableDates={availableDatesForMonth}
						loading={datesLoading}
						selectedDate={null}
						timezone={view.org_timezone}
						onSelectDate={handleSelectDate}
						onChangeMonth={handleMonthChange}
					/>
				{:else}
					<div class="book-manage__date-head">
						<div class="book-manage__meta-icon book-manage__meta-icon--brand">
							<i class="ri-calendar-event-line" aria-hidden="true"></i>
						</div>
						<div>
							<h2 class="book-manage__date-title">{selectedDateLabel}</h2>
							<p class="book-manage__date-hint">Choose a new time</p>
						</div>
					</div>
					<TimeSlots
						{slots}
						loading={slotsLoading}
						timezone={view.org_timezone}
						{selectedSlot}
						onSelect={handleSelectSlot}
					/>
					<button
						type="button"
						onclick={() => (selectedDate = null)}
						class="book-manage__day-link"
					>
						Pick a different day
					</button>
					{#if selectedSlot}
						<div class="book-manage__slot-bar">
							<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
							<div style="min-width:0">
								<p class="book-manage__slot-eyebrow">Your new time</p>
								<p class="book-manage__slot-time">{selectedSlotLabel}</p>
							</div>
						</div>
						{#if errorMsg}
							<p class="book-manage__error">{errorMsg}</p>
						{/if}
						<button
							type="button"
							disabled={submitting}
							onclick={confirmReschedule}
							class="book-manage__confirm-btn"
						>
							{submitting ? 'Confirming…' : 'Confirm reschedule'}
						</button>
					{/if}
				{/if}
			{:else if mode === 'confirm_cancel'}
				<div class="book-manage__cancel-confirm">
					<div class="book-manage__status-icon book-manage__status-icon--warning">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
					</div>
					<h2 class="book-manage__cancel-title">Cancel this appointment?</h2>
					<p class="book-manage__cancel-sub">{startLabel}</p>
					{#if errorMsg}
						<p class="book-manage__error">{errorMsg}</p>
					{/if}
					<div class="book-manage__cancel-actions">
						<button
							type="button"
							onclick={backToView}
							disabled={submitting}
							class="book-manage__keep-btn"
						>
							Keep appointment
						</button>
						<button
							type="button"
							disabled={submitting}
							onclick={confirmCancel}
							class="book-manage__confirm-cancel-btn"
						>
							{submitting ? 'Cancelling…' : 'Yes, cancel'}
						</button>
					</div>
				</div>
			{/if}
		</section>

		<p class="book-manage__tz">Times shown in {view.org_timezone.replace(/_/g, ' ')}</p>
	{/if}
</main>
