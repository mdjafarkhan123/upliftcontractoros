<script lang="ts">
	import { onMount } from 'svelte';
	import Calendar from '$lib/components/booking/Calendar.svelte';
	import TimeSlots from '$lib/components/booking/TimeSlots.svelte';
	import { formatInOrgTz } from '$lib/utils/formatInOrgTz';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import XCircle from '@lucide/svelte/icons/x-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

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

<main class="mx-auto w-full max-w-xl px-4 pb-16 pt-10 sm:pt-16">
	{#if loading}
		<div class="space-y-4">
			<div class="mx-auto h-5 w-40 animate-pulse rounded bg-muted/40"></div>
			<div class="h-40 animate-pulse rounded-2xl bg-muted/20"></div>
		</div>
	{:else if notFound || !view}
		<section
			class="mx-auto mt-12 max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-[0_20px_60px_-30px_hsl(0_0%_0%/0.6)]"
		>
			<div
				class="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted/40"
			>
				<AlertTriangle class="h-5 w-5 text-muted-foreground" />
			</div>
			<h1 class="text-lg font-semibold tracking-tight text-foreground">Link no longer works</h1>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
				This appointment link is invalid, expired, or has been updated. If you still need to make a
				change, please contact the business directly.
			</p>
		</section>
	{:else if mode === 'cancelled'}
		<section
			class="mx-auto mt-8 max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-[0_20px_60px_-30px_hsl(0_0%_0%/0.6)]"
		>
			<div
				class="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
			>
				<XCircle class="h-6 w-6" />
			</div>
			<h1 class="text-lg font-semibold tracking-tight text-foreground">Appointment cancelled</h1>
			<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
				Your {view.type.replaceAll('_', ' ')} with {view.org_name} has been cancelled. We've let the team
				know.
			</p>
		</section>
	{:else}
		<header class="mb-8 text-center">
			<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{view.org_name}
			</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
				{mode === 'rescheduled' ? "You're all set" : 'Manage your appointment'}
			</h1>
			{#if view.contact_first_name}
				<p class="mt-2 text-sm text-muted-foreground">
					Hi {view.contact_first_name} — review the details below.
				</p>
			{/if}
		</header>

		<section
			class="overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-[0_20px_60px_-30px_hsl(0_0%_0%/0.6)] sm:p-7"
		>
			{#if mode === 'view' || mode === 'rescheduled'}
				{#if mode === 'rescheduled'}
					<div
						class="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
					>
						<CheckCircle2 class="h-5 w-5 shrink-0 text-primary" />
						<p class="text-sm font-medium text-foreground">Your new time is locked in.</p>
					</div>
				{/if}

				<div class="space-y-4">
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
						>
							<CalendarIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0">
							<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								When
							</p>
							<p class="mt-0.5 text-sm font-medium text-foreground">{startLabel}</p>
						</div>
					</div>
					<div class="flex items-start gap-3">
						<div
							class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground"
						>
							<Clock class="h-4 w-4" />
						</div>
						<div class="min-w-0">
							<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								What
							</p>
							<p class="mt-0.5 text-sm font-medium text-foreground">
								{view.title} ({view.type.replaceAll('_', ' ')})
							</p>
						</div>
					</div>
					{#if view.location}
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground"
							>
								<MapPin class="h-4 w-4" />
							</div>
							<div class="min-w-0">
								<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									Where
								</p>
								<p class="mt-0.5 text-sm font-medium text-foreground">{view.location}</p>
							</div>
						</div>
					{/if}
				</div>

				<div class="mt-7 grid gap-2 sm:grid-cols-2">
					{#if view.can_reschedule}
						<button
							type="button"
							onclick={startReschedule}
							class="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border/60 bg-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
						>
							Reschedule
						</button>
					{/if}
					<button
						type="button"
						onclick={() => (mode = 'confirm_cancel')}
						class="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
					>
						Cancel appointment
					</button>
				</div>
				{#if !view.can_reschedule}
					<p class="mt-3 text-center text-xs text-muted-foreground">
						To reschedule, please contact {view.org_name} directly.
					</p>
				{/if}
			{:else if mode === 'reschedule'}
				<button
					type="button"
					onclick={backToView}
					class="mb-5 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<ArrowLeft class="h-3.5 w-3.5" /> Back
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
							<p class="mt-0.5 text-xs text-muted-foreground">Choose a new time</p>
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
						class="mt-4 text-xs font-medium text-muted-foreground hover:text-foreground"
					>
						Pick a different day
					</button>
					{#if selectedSlot}
						<div
							class="mt-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
						>
							<CheckCircle2 class="h-5 w-5 shrink-0 text-primary" />
							<div class="min-w-0">
								<p class="text-[11px] font-medium uppercase tracking-wider text-primary/80">
									Your new time
								</p>
								<p class="truncate text-sm font-medium text-foreground">{selectedSlotLabel}</p>
							</div>
						</div>
						{#if errorMsg}
							<p class="mt-3 text-xs text-destructive">{errorMsg}</p>
						{/if}
						<button
							type="button"
							disabled={submitting}
							onclick={confirmReschedule}
							class="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
						>
							{submitting ? 'Confirming…' : 'Confirm reschedule'}
						</button>
					{/if}
				{/if}
			{:else if mode === 'confirm_cancel'}
				<div class="text-center">
					<div
						class="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
					>
						<AlertTriangle class="h-6 w-6" />
					</div>
					<h2 class="text-lg font-semibold tracking-tight text-foreground">
						Cancel this appointment?
					</h2>
					<p class="mt-2 text-sm text-muted-foreground">
						{startLabel}
					</p>
					{#if errorMsg}
						<p class="mt-3 text-xs text-destructive">{errorMsg}</p>
					{/if}
					<div class="mt-6 grid gap-2 sm:grid-cols-2">
						<button
							type="button"
							onclick={backToView}
							disabled={submitting}
							class="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
						>
							Keep appointment
						</button>
						<button
							type="button"
							disabled={submitting}
							onclick={confirmCancel}
							class="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
						>
							{submitting ? 'Cancelling…' : 'Yes, cancel'}
						</button>
					</div>
				</div>
			{/if}
		</section>

		<p class="mt-6 text-center text-[11px] text-muted-foreground/60">
			Times shown in {view.org_timezone.replace(/_/g, ' ')}
		</p>
	{/if}
</main>
