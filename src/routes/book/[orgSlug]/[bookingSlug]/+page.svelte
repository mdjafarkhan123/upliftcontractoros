<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Calendar from '$lib/components/booking/Calendar.svelte';
	import TimeSlots from '$lib/components/booking/TimeSlots.svelte';
	import CustomerForm from '$lib/components/booking/CustomerForm.svelte';
	import RequestWizard from '$lib/components/booking/request/RequestWizard.svelte';
	import type { StandardFieldConfig } from '$lib/types/bookingForms';

	type Config = {
		org_name: string;
		org_logo_url: string | null;
		org_timezone: string;
		org_country: string | null;
		title: string;
		description: string | null;
		form_type: 'booking' | 'request';
		requires_approval: boolean;
		appointment_type: string;
		slot_duration_minutes: number;
		// Per-form field config for request forms (R5.2). Absent on booking forms.
		fields?: StandardFieldConfig[];
	};

	const orgSlug = $derived(page.params.orgSlug!);
	const bookingSlug = $derived(page.params.bookingSlug!);
	const apiBase = $derived(`/api/public/booking/${orgSlug}/${bookingSlug}`);

	let config = $state<Config | null>(null);
	let configLoading = $state(true);

	let step = $state<1 | 2 | 3>(1);

	// Calendar state
	function currentMonthInTz(tz: string): string {
		const fmt = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit'
		});
		return fmt.format(new Date()); // YYYY-MM
	}

	let month = $state<string>('');
	let availableDatesByMonth = $state<Map<string, Set<string>>>(new Map());
	let datesLoading = $state(false);

	// Slot state
	let selectedDate = $state<string | null>(null);
	let slots = $state<string[]>([]);
	let slotsLoading = $state(false);

	// Submit state
	let selectedSlot = $state<string | null>(null);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let submitFieldErrors = $state<Record<string, string>>({});

	const availableDatesForMonth = $derived(availableDatesByMonth.get(month) ?? new Set<string>());

	const selectedSlotLabel = $derived(
		selectedSlot && config
			? new Intl.DateTimeFormat('en-US', {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					timeZone: config.org_timezone
				}).format(new Date(selectedSlot))
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

	onMount(async () => {
		await loadConfig();
	});

	async function loadConfig() {
		configLoading = true;
		try {
			const res = await fetch(apiBase, { headers: { accept: 'application/json' } });
			if (!res.ok) {
				goto(`/book/${orgSlug}/${bookingSlug}/unavailable`, { replaceState: true });
				return;
			}
			const body = await res.json();
			config = body.data as Config;
			month = currentMonthInTz(config.org_timezone);
			// Request forms drive their own wizard (RequestWizard) and load their own
			// availability — skip the booking-flow date preload for them.
			if (config.form_type !== 'request') await loadDates(month);
		} catch {
			goto(`/book/${orgSlug}/${bookingSlug}/unavailable`, { replaceState: true });
		} finally {
			configLoading = false;
		}
	}

	async function loadDates(targetMonth: string) {
		if (availableDatesByMonth.has(targetMonth)) return;
		datesLoading = true;
		try {
			const res = await fetch(`${apiBase}/dates?month=${targetMonth}`);
			if (!res.ok) {
				availableDatesByMonth.set(targetMonth, new Set());
				availableDatesByMonth = new Map(availableDatesByMonth);
				return;
			}
			const body = await res.json();
			const dates: string[] = body.data?.dates ?? [];
			availableDatesByMonth.set(targetMonth, new Set(dates));
			availableDatesByMonth = new Map(availableDatesByMonth);
		} catch {
			availableDatesByMonth.set(targetMonth, new Set());
			availableDatesByMonth = new Map(availableDatesByMonth);
		} finally {
			datesLoading = false;
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
		step = 2;
		await loadSlots(date);
	}

	async function loadSlots(date: string) {
		slotsLoading = true;
		try {
			const res = await fetch(`${apiBase}/slots?date=${date}`);
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

	function handleSelectSlot(iso: string) {
		selectedSlot = iso;
		step = 3;
	}

	function backToCalendar() {
		step = 1;
		selectedSlot = null;
	}
	function backToSlots() {
		step = 2;
		submitError = null;
		submitFieldErrors = {};
	}

	async function submit(input: {
		customerName: string;
		customerPhone: string;
		customerEmail: string;
		notes: string;
		website: string;
	}) {
		if (!selectedSlot || !selectedDate) return;
		submitting = true;
		submitError = null;
		submitFieldErrors = {};
		try {
			const res = await fetch(apiBase, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					date: selectedDate,
					slotStart: selectedSlot,
					customerName: input.customerName,
					customerPhone: input.customerPhone,
					customerEmail: input.customerEmail || undefined,
					notes: input.notes || undefined,
					website: input.website,
					source:
						typeof document !== 'undefined' && document.referrer ? document.referrer : undefined
				})
			});
			const body = await res.json().catch(() => ({}));
			if (res.status === 409) {
				submitError = body.error ?? 'This time slot is no longer available.';
				// Refresh slots so the user can pick another.
				await loadSlots(selectedDate);
				selectedSlot = null;
				step = 2;
				return;
			}
			if (!res.ok) {
				submitError = body.error ?? 'Could not complete booking. Please try again.';
				submitFieldErrors = body.field_errors ?? {};
				return;
			}
			const data = body.data as {
				appointmentId: string;
				scheduledStart: string;
				orgName: string;
				bookingTitle: string;
			};
			// Pass minimal confirmation context via sessionStorage so the success page renders instantly.
			try {
				sessionStorage.setItem(
					`book:confirm:${data.appointmentId}`,
					JSON.stringify({
						orgName: data.orgName,
						bookingTitle: data.bookingTitle,
						scheduledStart: data.scheduledStart,
						timezone: config?.org_timezone ?? 'UTC'
					})
				);
			} catch {
				// sessionStorage may be unavailable — success page falls back gracefully.
			}
			await goto(
				`/book/${orgSlug}/${bookingSlug}/success?a=${encodeURIComponent(data.appointmentId)}`
			);
		} catch {
			submitError = 'Could not complete booking. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Book an appointment</title>
</svelte:head>

<main class="book-portal">
	<!-- Header -->
	<header class="book-portal__header">
		<div class="book-portal__logo">
			{#if config?.org_logo_url}
				<img src={config.org_logo_url} alt={config.org_name} class="book-portal__logo-img" />
			{:else}
				<i class="ri-building-2-line" aria-hidden="true"></i>
			{/if}
		</div>

		{#if configLoading}
			<div class="book-portal__skel-name"></div>
			<div class="book-portal__skel-desc"></div>
		{:else if config}
			<p class="book-portal__org">{config.org_name}</p>
			<h1 class="book-portal__title">{config.title}</h1>
			{#if config.description}
				<p class="book-portal__desc">{config.description}</p>
			{/if}
			<div class="book-portal__duration">
				<i class="ri-time-line" aria-hidden="true"></i>
				{config.slot_duration_minutes} min
			</div>
		{/if}
	</header>

	<!-- Request form drives its own multi-step wizard (contact → details → schedule → review). -->
	{#if config && config.form_type === 'request'}
		<RequestWizard {config} {orgSlug} {bookingSlug} {apiBase} />
	{/if}

	<!-- Step progress bars (booking flow) -->
	{#if config && config.form_type !== 'request'}
		<div class="book-portal__steps">
			{#each [1, 2, 3] as n (n)}
				<div class="book-portal__step {n <= step ? 'book-portal__step--active' : ''}"></div>
			{/each}
		</div>
	{/if}

	<!-- Content card (booking flow) -->
	{#if config && config.form_type !== 'request'}
		<section class="book-portal__card">
			{#if step === 1}
				<Calendar
					{month}
					availableDates={availableDatesForMonth}
					loading={datesLoading}
					{selectedDate}
					timezone={config.org_timezone}
					onSelectDate={handleSelectDate}
					onChangeMonth={handleMonthChange}
				/>
			{:else if step === 2}
				<div>
					<button type="button" onclick={backToCalendar} class="book-portal__back">
						<i class="ri-arrow-left-s-line" aria-hidden="true"></i> Back
					</button>
					<div class="book-portal__date-head">
						<div class="book-portal__date-icon">
							<i class="ri-calendar-event-line" aria-hidden="true"></i>
						</div>
						<div>
							<h2 class="book-portal__date-title">{selectedDateLabel}</h2>
							<p class="book-portal__date-hint">Choose a time</p>
						</div>
					</div>
					<TimeSlots
						{slots}
						loading={slotsLoading}
						timezone={config.org_timezone}
						{selectedSlot}
						onSelect={handleSelectSlot}
					/>
				</div>
			{:else}
				<div>
					<button type="button" onclick={backToSlots} class="book-portal__back">
						<i class="ri-arrow-left-s-line" aria-hidden="true"></i> Back
					</button>
					<div class="book-portal__slot-bar">
						<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
						<div class="booking-portal__slot-info">
							<p class="book-portal__slot-eyebrow">Your time</p>
							<p class="book-portal__slot-time">{selectedSlotLabel}</p>
						</div>
					</div>
					<CustomerForm
						{submitting}
						error={submitError}
						fieldErrors={submitFieldErrors}
						defaultCountry={config.org_country ?? 'US'}
						onSubmit={submit}
					/>
				</div>
			{/if}
		</section>

		<p class="book-portal__tz">Times shown in {config.org_timezone.replace(/_/g, ' ')}</p>
	{/if}
</main>
