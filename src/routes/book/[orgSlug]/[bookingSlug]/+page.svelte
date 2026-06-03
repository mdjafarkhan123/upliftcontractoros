<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Calendar from '$lib/components/booking/Calendar.svelte';
	import TimeSlots from '$lib/components/booking/TimeSlots.svelte';
	import CustomerForm from '$lib/components/booking/CustomerForm.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Building2 from '@lucide/svelte/icons/building-2';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';

	type Config = {
		org_name: string;
		org_logo_url: string | null;
		org_timezone: string;
		title: string;
		description: string | null;
		appointment_type: string;
		slot_duration_minutes: number;
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
			await loadDates(month);
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

<main class="mx-auto w-full max-w-xl px-4 pb-16 pt-10 sm:pt-16">
	<!-- Header -->
	<header class="mb-8 text-center">
		<div
			class="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-[0_8px_30px_-12px_hsl(var(--brand-primary)/0.4)]"
		>
			{#if config?.org_logo_url}
				<img
					src={config.org_logo_url}
					alt={config.org_name}
					class="h-10 w-10 rounded-xl object-cover"
				/>
			{:else}
				<Building2 class="h-6 w-6 text-primary" />
			{/if}
		</div>
		{#if configLoading}
			<div class="mx-auto h-5 w-40 animate-pulse rounded bg-muted/40"></div>
			<div class="mx-auto mt-3 h-3 w-56 animate-pulse rounded bg-muted/30"></div>
		{:else if config}
			<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{config.org_name}
			</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
				{config.title}
			</h1>
			{#if config.description}
				<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
					{config.description}
				</p>
			{/if}
			<div
				class="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground"
			>
				<Clock class="h-3 w-3" />
				{config.slot_duration_minutes} min
			</div>
		{/if}
	</header>

	<!-- Step indicator -->
	{#if config}
		<div class="mb-6 flex items-center justify-center gap-2">
			{#each [1, 2, 3] as n (n)}
				<div
					class={`h-1 w-10 rounded-full transition-all duration-300 ease-out ${
						n <= step ? 'bg-primary' : 'bg-muted/40'
					}`}
				></div>
			{/each}
		</div>
	{/if}

	<!-- Card -->
	{#if config}
		<section
			class="overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[0_20px_60px_-30px_hsl(0_0%_0%/0.6)] sm:p-7"
		>
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
					<button
						type="button"
						onclick={backToCalendar}
						class="mb-5 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					>
						<ArrowLeft class="h-3.5 w-3.5" /> Back
					</button>
					<div class="mb-5 flex items-start gap-3">
						<div
							class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
						>
							<CalendarIcon class="h-4 w-4" />
						</div>
						<div>
							<h2 class="text-lg font-semibold tracking-tight text-foreground">
								{selectedDateLabel}
							</h2>
							<p class="mt-0.5 text-xs text-muted-foreground">Choose a time</p>
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
					<button
						type="button"
						onclick={backToSlots}
						class="mb-5 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					>
						<ArrowLeft class="h-3.5 w-3.5" /> Back
					</button>
					<div
						class="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
					>
						<CheckCircle2 class="h-5 w-5 shrink-0 text-primary" />
						<div class="min-w-0">
							<p class="text-[11px] font-medium uppercase tracking-wider text-primary/80">
								Your time
							</p>
							<p class="truncate text-sm font-medium text-foreground">{selectedSlotLabel}</p>
						</div>
					</div>
					<CustomerForm
						{submitting}
						error={submitError}
						fieldErrors={submitFieldErrors}
						onSubmit={submit}
					/>
				</div>
			{/if}
		</section>

		<p class="mt-6 text-center text-[11px] text-muted-foreground/60">
			Times shown in {config.org_timezone.replace(/_/g, ' ')}
		</p>
	{/if}
</main>
