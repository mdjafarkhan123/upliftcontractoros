<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
	import { toast } from '$lib/stores/toast.svelte';

	const member = getMemberContext();
	const flags = getFeatureFlagsContext();
	const org = getOrgContext();

	$effect(() => {
		if (member().role !== 'admin' || !flags().feature_online_booking) goto('/settings/booking');
	});

	type Step = 1 | 2 | 3;
	type Window = { start: string; end: string };
	type DayState = { day_of_week: number; enabled: boolean; windows: Window[] };
	type StagedOverride = {
		key: string;
		override_date: string;
		is_blocked: boolean;
		start_time: string;
		end_time: string;
		reason: string;
	};

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	let step = $state<Step>(1);

	// Step 1
	let title = $state('Book an Appointment');
	let slug = $state('');
	let description = $state('');
	let appointment_type = $state<'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other'>(
		'estimate'
	);
	let slot_duration_minutes = $state(60);
	let buffer_minutes = $state(0);
	let min_advance_hours = $state(4);
	let max_future_days = $state(30);

	// Step 2 — pre-seeded with Mon–Fri 8–5 (matches server default for parity)
	let days = $state<DayState[]>(
		Array.from({ length: 7 }, (_, i) => ({
			day_of_week: i,
			enabled: i >= 1 && i <= 5,
			windows: i >= 1 && i <= 5 ? [{ start: '08:00', end: '17:00' }] : []
		}))
	);

	// Step 3
	let overrides = $state<StagedOverride[]>([]);
	let showOverrideForm = $state(false);
	let ovDate = $state('');
	let ovBlocked = $state(true);
	let ovStart = $state('08:00');
	let ovEnd = $state('17:00');
	let ovReason = $state('');
	let ovErrors = $state<Record<string, string>>({});

	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	let created = $state<null | {
		id: string;
		slug: string;
		title: string;
		slot_duration_minutes: number;
		buffer_minutes: number;
		min_advance_hours: number;
		max_future_days: number;
	}>(null);

	const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

	function liveNormalizeSlug(raw: string): string {
		return raw
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-{2,}/g, '-');
	}

	function finalNormalizeSlug(raw: string): string {
		return liveNormalizeSlug(raw).replace(/^-+|-+$/g, '');
	}

	function onSlugInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const cleaned = liveNormalizeSlug(el.value);
		if (cleaned !== el.value) {
			const pos = el.selectionStart ?? cleaned.length;
			slug = cleaned;
			queueMicrotask(() => {
				try {
					el.setSelectionRange(Math.min(pos, cleaned.length), Math.min(pos, cleaned.length));
				} catch {
					/* ignore */
				}
			});
		} else {
			slug = cleaned;
		}
	}

	function onSlugBlur() {
		slug = finalNormalizeSlug(slug);
	}

	const normalizedSlug = $derived(finalNormalizeSlug(slug));
	const previewUrl = $derived(
		normalizedSlug ? bookingPublicUrl(org().slug, normalizedSlug) : `/book/${org().slug}/…`
	);

	type SlugState = 'idle' | 'too_short' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';
	let slugState = $state<SlugState>('idle');

	$effect(() => {
		const s = normalizedSlug;
		if (!s) {
			slugState = 'idle';
			return;
		}
		if (s.length < 3) {
			slugState = 'too_short';
			return;
		}
		if (s.length > 60 || !slugRegex.test(s)) {
			slugState = 'invalid';
			return;
		}
		slugState = 'checking';
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/booking-links/check-slug?slug=${encodeURIComponent(s)}`, {
					signal: controller.signal
				});
				if (controller.signal.aborted) return;
				const body = await res.json().catch(() => ({}));
				if (normalizedSlug !== s) return;
				if (res.ok && body.data?.available === true) slugState = 'available';
				else if (res.ok && body.data?.available === false) slugState = 'taken';
				else slugState = 'error';
			} catch (err) {
				if ((err as Error)?.name === 'AbortError') return;
				if (normalizedSlug === s) slugState = 'error';
			}
		}, 500);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	const today = new Date().toISOString().slice(0, 10);

	const dirty = $derived(
		!created &&
			(slug.trim() !== '' ||
				description.trim() !== '' ||
				title.trim() !== 'Book an Appointment' ||
				overrides.length > 0)
	);

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	function toMinutes(t: string): number {
		const [h, m] = t.split(':');
		return Number(h) * 60 + Number(m);
	}

	// ---- Step 1 validation ----
	function validateStep1(): boolean {
		const errs: Record<string, string> = {};
		if (!title.trim()) errs.title = 'Title is required.';
		else if (title.trim().length > 120) errs.title = 'Title must be 120 characters or fewer.';

		if (!normalizedSlug) errs.slug = 'Slug is required.';
		else if (normalizedSlug.length < 3 || normalizedSlug.length > 60)
			errs.slug = 'Slug must be 3–60 characters.';
		else if (!slugRegex.test(normalizedSlug))
			errs.slug = 'Use lowercase letters, numbers, and hyphens only.';
		else if (slugState === 'taken') errs.slug = 'This URL is already in use.';
		else if (slugState === 'checking') errs.slug = 'Still checking availability…';

		if (![30, 45, 60, 90, 120].includes(slot_duration_minutes))
			errs.slot_duration_minutes = 'Invalid duration.';

		fieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	// ---- Step 2 ----
	function toggleDay(d: DayState, v: boolean) {
		d.enabled = v;
		if (v && d.windows.length === 0) d.windows = [{ start: '08:00', end: '17:00' }];
		if (!v) d.windows = [];
	}

	function addWindow(d: DayState) {
		d.windows = [...d.windows, { start: '13:00', end: '17:00' }];
	}

	function removeWindow(d: DayState, idx: number) {
		d.windows = d.windows.filter((_, i) => i !== idx);
		if (d.windows.length === 0) d.enabled = false;
	}

	function validateStep2(): string | null {
		for (const d of days) {
			if (!d.enabled) continue;
			if (d.windows.length === 0)
				return `${DAY_NAMES[d.day_of_week]}: add a time window or mark unavailable.`;
			for (const w of d.windows) {
				if (!w.start || !w.end) return `${DAY_NAMES[d.day_of_week]}: fill in both times.`;
				if (toMinutes(w.end) <= toMinutes(w.start))
					return `${DAY_NAMES[d.day_of_week]}: end must be after start.`;
			}
			const sorted = [...d.windows]
				.map((w) => ({ s: toMinutes(w.start), e: toMinutes(w.end) }))
				.sort((a, b) => a.s - b.s);
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].s < sorted[i - 1].e)
					return `${DAY_NAMES[d.day_of_week]}: windows cannot overlap.`;
			}
		}
		const anyEnabled = days.some((d) => d.enabled);
		if (!anyEnabled) return 'Enable at least one day of availability.';
		return null;
	}

	// ---- Step 3 ----
	function resetOverrideForm() {
		ovDate = '';
		ovBlocked = true;
		ovStart = '08:00';
		ovEnd = '17:00';
		ovReason = '';
		ovErrors = {};
	}

	function addOverride(e: Event) {
		e.preventDefault();
		const errs: Record<string, string> = {};
		if (!ovDate) errs.override_date = 'Date is required.';
		else if (ovDate < today) errs.override_date = 'Must be today or later.';
		else if (overrides.some((o) => o.override_date === ovDate))
			errs.override_date = 'Already in your blocked list.';

		if (!ovBlocked) {
			if (!ovStart || !ovEnd) errs.end_time = 'Fill both times.';
			else if (toMinutes(ovEnd) <= toMinutes(ovStart)) errs.end_time = 'End must be after start.';
		}

		ovErrors = errs;
		if (Object.keys(errs).length > 0) return;

		overrides = [
			...overrides,
			{
				key: crypto.randomUUID(),
				override_date: ovDate,
				is_blocked: ovBlocked,
				start_time: ovStart,
				end_time: ovEnd,
				reason: ovReason.trim()
			}
		].sort((a, b) => a.override_date.localeCompare(b.override_date));
		resetOverrideForm();
		showOverrideForm = false;
	}

	function removeOverride(key: string) {
		overrides = overrides.filter((o) => o.key !== key);
	}

	// ---- Navigation ----
	function goNext() {
		errorMsg = null;
		if (step === 1) {
			if (!validateStep1()) return;
			step = 2;
		} else if (step === 2) {
			const err = validateStep2();
			if (err) {
				errorMsg = err;
				return;
			}
			step = 3;
		}
	}

	function goBack() {
		errorMsg = null;
		if (step === 2) step = 1;
		else if (step === 3) step = 2;
	}

	// ---- Submit ----
	async function submit(skipOverrides: boolean) {
		if (submitting) return;
		errorMsg = null;
		fieldErrors = {};

		if (!validateStep1()) {
			step = 1;
			errorMsg = 'Fix the highlighted fields.';
			return;
		}
		const step2Err = validateStep2();
		if (step2Err) {
			step = 2;
			errorMsg = step2Err;
			return;
		}

		const windowsPayload = days.flatMap((d) =>
			d.enabled
				? d.windows.map((w) => ({
						day_of_week: d.day_of_week,
						start_time: w.start,
						end_time: w.end
					}))
				: []
		);

		const overridesPayload = skipOverrides
			? []
			: overrides.map((o) => ({
					override_date: o.override_date,
					is_blocked: o.is_blocked,
					start_time: o.is_blocked ? null : o.start_time,
					end_time: o.is_blocked ? null : o.end_time,
					reason: o.reason || null
				}));

		submitting = true;
		try {
			const res = await fetch('/api/booking-links', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					slug: normalizedSlug,
					description: description.trim() || null,
					appointment_type,
					slot_duration_minutes,
					buffer_minutes,
					min_advance_hours,
					max_future_days,
					windows: windowsPayload,
					overrides: overridesPayload
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				const fe: Record<string, string> = body.field_errors ?? {};
				fieldErrors = fe;
				const keys = Object.keys(fe);
				if (keys.some((k) => k === 'slug' || k === 'title' || k === 'description')) {
					step = 1;
				} else if (keys.some((k) => k.startsWith('windows.'))) {
					step = 2;
				} else if (keys.some((k) => k.startsWith('overrides.'))) {
					step = 3;
				}
				errorMsg = body.error ?? 'Failed to create booking link.';
				return;
			}
			created = body.data;
			toast.success('Booking page created');
		} finally {
			submitting = false;
		}
	}

	// ---- Success screen helpers ----
	const publicUrl = $derived(created ? bookingPublicUrl(org().slug, created.slug) : '');

	const availabilitySummary = $derived(
		days
			.filter((d) => d.enabled)
			.map((d) => {
				const w = d.windows[0];
				const rest = d.windows.length > 1 ? ` +${d.windows.length - 1}` : '';
				return `${SHORT_DAYS[d.day_of_week]} ${w.start}–${w.end}${rest}`;
			})
			.join(' · ') || 'No days enabled'
	);

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(publicUrl);
			toast.success('URL copied');
		} catch {
			toast.error('Could not copy');
		}
	}

	function formatOverrideDate(iso: string): string {
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	const STEP_LABELS = ['Booking Details', 'Availability', 'Blocked Dates'];

	// The date-picker Calendar (bits-ui) only appears deep in step 3 when blocking
	// a date — load it lazily so the wizard shell parses and paints instantly.
	let Calendar = $state<typeof import('$lib/components/ui/calendar').Calendar | null>(null);
	$effect(() => {
		if (Calendar || !showOverrideForm) return;
		void import('$lib/components/ui/calendar').then((m) => {
			Calendar = m.Calendar;
		});
	});
</script>

<svelte:head><title>New booking link</title></svelte:head>

{#if !created}
	<PageWrapper
		title="New booking link"
		subtitle="Configure how customers book this appointment type."
		back="/settings/booking"
	>
		<!-- Stepper -->
		<ol class="book-stepper">
			{#each STEP_LABELS as label, i (label)}
				{@const n = (i + 1) as Step}
				{@const done = step > n}
				{@const active = step === n}
				<li class="book-stepper__step">
					<span
						class="book-stepper__bullet"
						class:book-stepper__bullet--done={done}
						class:book-stepper__bullet--active={active}
					>
						{#if done}
							<i class="ri-check-line" aria-hidden="true"></i>
						{:else}
							{n}
						{/if}
					</span>
					<span class="book-stepper__label" class:book-stepper__label--active={active}>
						{label}{#if n === 3}<span class="book-stepper__optional">(Optional)</span>{/if}
					</span>
				</li>
				{#if i < STEP_LABELS.length - 1}
					<li class="book-stepper__line" aria-hidden="true"></li>
				{/if}
			{/each}
		</ol>

		{#if errorMsg}
			<div class="book-error">{errorMsg}</div>
		{/if}

		<!-- ============================================================ -->
		<!-- STEP 1: Booking Details                                       -->
		<!-- ============================================================ -->
		{#if step === 1}
			<div class="book-form">
				<div class="settings-card">
					<div class="settings-card__header">
						<div class="settings-card__head-text">
							<p class="settings-card__title">Link Details</p>
							<p class="settings-card__desc">What customers see on your booking page</p>
						</div>
					</div>
					<div class="settings-card__body">
						<div class="field">
							<Label for="title" class="field__label field__label--required">Title</Label>
							<Input id="title" bind:value={title} required maxlength={120} />
							<p class="field__hint">Shown to customers on the booking page.</p>
							{#if fieldErrors.title}<p class="field__error">{fieldErrors.title}</p>{/if}
						</div>

						<div class="field">
							<Label for="slug" class="field__label field__label--required">URL slug</Label>
							<Input
								id="slug"
								value={slug}
								oninput={onSlugInput}
								onblur={onSlugBlur}
								required
								maxlength={60}
								placeholder="estimate"
								autocomplete="off"
								spellcheck={false}
							/>
							<div class="book-urlchip">
								<i class="ri-link" aria-hidden="true"></i>
								<span>{previewUrl}</span>
							</div>
							{#if normalizedSlug && slugState === 'checking'}
								<p class="book-slug-status">
									<i class="ri-loader-4-line book-spin" aria-hidden="true"></i> Checking availability…
								</p>
							{:else if slugState === 'available'}
								<p class="book-slug-status book-slug-status--ok">
									<i class="ri-check-line" aria-hidden="true"></i> Available
								</p>
							{:else if slugState === 'taken'}
								<p class="book-slug-status book-slug-status--bad">
									<i class="ri-close-line" aria-hidden="true"></i> Already in use — try another.
								</p>
							{:else if slugState === 'too_short' && normalizedSlug}
								<p class="book-slug-status">
									{3 - normalizedSlug.length} more character{3 - normalizedSlug.length === 1
										? ''
										: 's'} to check availability.
								</p>
							{:else if slugState === 'invalid'}
								<p class="book-slug-status book-slug-status--bad">
									Use lowercase letters, numbers, and hyphens only.
								</p>
							{:else if slugState === 'error'}
								<p class="book-slug-status">
									Couldn't check availability — we'll verify on submit.
								</p>
							{/if}
							{#if fieldErrors.slug}<p class="field__error">{fieldErrors.slug}</p>{/if}
						</div>

						<div class="field">
							<Label for="description" class="field__label">Description</Label>
							<Textarea id="description" bind:value={description} maxlength={2000} rows={3} />
						</div>

						<div class="field">
							<Label for="appointment_type" class="field__label field__label--required">
								Appointment type
							</Label>
							<Select.Root bind:value={appointment_type}>
								<Select.Trigger>
									<Select.Value />
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="estimate" label="Estimate">Estimate</Select.Item>
									<Select.Item value="job_start" label="Job start">Job start</Select.Item>
									<Select.Item value="follow_up" label="Follow up">Follow up</Select.Item>
									<Select.Item value="inspection" label="Inspection">Inspection</Select.Item>
									<Select.Item value="other" label="Other">Other</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
					</div>
				</div>

				<div class="settings-card">
					<div class="settings-card__header">
						<div class="settings-card__head-text">
							<p class="settings-card__title">Schedule Settings</p>
							<p class="settings-card__desc">Control timing and availability rules</p>
						</div>
					</div>
					<div class="settings-card__body">
						<div class="book-grid">
							<div class="field">
								<Label for="slot" class="field__label field__label--required">Slot duration</Label>
								<Select.Root bind:value={slot_duration_minutes}>
									<Select.Trigger>
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={30} label="30 min">30 min</Select.Item>
										<Select.Item value={45} label="45 min">45 min</Select.Item>
										<Select.Item value={60} label="60 min">60 min</Select.Item>
										<Select.Item value={90} label="90 min">90 min</Select.Item>
										<Select.Item value={120} label="120 min">120 min</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>

							<div class="field">
								<Label for="buffer" class="field__label field__label--required">
									Buffer between bookings
								</Label>
								<Select.Root bind:value={buffer_minutes}>
									<Select.Trigger>
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={0} label="None">None</Select.Item>
										<Select.Item value={15} label="15 min">15 min</Select.Item>
										<Select.Item value={30} label="30 min">30 min</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>

							<div class="field">
								<Label for="advance" class="field__label field__label--required">
									Minimum advance notice
								</Label>
								<Select.Root bind:value={min_advance_hours}>
									<Select.Trigger>
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={1} label="1 hour">1 hour</Select.Item>
										<Select.Item value={4} label="4 hours">4 hours</Select.Item>
										<Select.Item value={24} label="24 hours">24 hours</Select.Item>
										<Select.Item value={48} label="48 hours">48 hours</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>

							<div class="field">
								<Label for="horizon" class="field__label field__label--required"
									>Booking horizon</Label
								>
								<Select.Root bind:value={max_future_days}>
									<Select.Trigger>
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={14} label="14 days">14 days</Select.Item>
										<Select.Item value={30} label="30 days">30 days</Select.Item>
										<Select.Item value={60} label="60 days">60 days</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					</div>
				</div>

				<div class="book-actions">
					<Button variant="outline" onclick={() => goto('/settings/booking')} disabled={submitting}>
						Cancel
					</Button>
					<Button
						onclick={goNext}
						disabled={submitting ||
							slugState === 'checking' ||
							slugState === 'taken' ||
							slugState === 'invalid' ||
							slugState === 'too_short' ||
							slugState === 'idle'}
					>
						Next <i class="ri-arrow-right-line" aria-hidden="true"></i>
					</Button>
				</div>
			</div>
		{/if}

		<!-- ============================================================ -->
		<!-- STEP 2: Availability                                          -->
		<!-- ============================================================ -->
		{#if step === 2}
			<div class="book-form">
				<p class="book-lead">Choose the days and time windows when customers can book.</p>

				<div class="book-list">
					{#each days as d (d.day_of_week)}
						<div class="book-day">
							<div class="book-day__head">
								<div>
									<p class="book-day__name">{DAY_NAMES[d.day_of_week]}</p>
									<p class="book-day__status">{d.enabled ? 'Available' : 'Unavailable'}</p>
								</div>
								<Switch checked={d.enabled} onCheckedChange={(v: boolean) => toggleDay(d, v)} />
							</div>

							{#if d.enabled}
								<div class="book-day__windows">
									{#each d.windows as w, i (i)}
										<div class="book-day__window">
											<input type="time" bind:value={w.start} class="book-time" />
											<span class="book-day__sep">–</span>
											<input type="time" bind:value={w.end} class="book-time" />
											<button
												type="button"
												class="book-iconbtn"
												onclick={() => removeWindow(d, i)}
												aria-label="Remove window"
											>
												<i class="ri-close-line" aria-hidden="true"></i>
											</button>
										</div>
									{/each}
									<Button variant="outline" size="sm" onclick={() => addWindow(d)}>
										<i class="ri-add-line" aria-hidden="true"></i> Add window
									</Button>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<div class="book-actions">
					<Button variant="outline" onclick={goBack} disabled={submitting}>
						<i class="ri-arrow-left-line" aria-hidden="true"></i> Back
					</Button>
					<Button onclick={goNext} disabled={submitting}>
						Next <i class="ri-arrow-right-line" aria-hidden="true"></i>
					</Button>
				</div>
			</div>
		{/if}

		<!-- ============================================================ -->
		<!-- STEP 3: Blocked Dates (optional)                              -->
		<!-- ============================================================ -->
		{#if step === 3}
			<div class="book-form">
				<div class="book-info">
					<p class="book-info__title">Blocked dates are optional</p>
					<p class="book-info__text">
						Block specific days (holidays, vacations) or set custom hours for one-off dates. You can
						also add these later.
					</p>
				</div>

				{#if !showOverrideForm}
					<div>
						<Button onclick={() => (showOverrideForm = true)}>
							<i class="ri-add-line" aria-hidden="true"></i> Block a date
						</Button>
					</div>
				{:else}
					<form class="book-ovform" onsubmit={addOverride}>
						<div class="field">
							<Label for="ov-date" class="field__label field__label--required">Date</Label>
							{#if Calendar}
								<Calendar bind:value={ovDate} placeholder="Pick a date" min={today} />
							{/if}
							{#if ovErrors.override_date}
								<p class="field__error">{ovErrors.override_date}</p>
							{/if}
						</div>

						<div class="field">
							<Label class="field__label field__label--required">Type</Label>
							<div class="book-ovform__types">
								<label class="book-radio" class:book-radio--active={ovBlocked}>
									<input
										type="radio"
										name="block-type"
										checked={ovBlocked}
										onchange={() => (ovBlocked = true)}
									/>
									Block all day
								</label>
								<label class="book-radio" class:book-radio--active={!ovBlocked}>
									<input
										type="radio"
										name="block-type"
										checked={!ovBlocked}
										onchange={() => (ovBlocked = false)}
									/>
									Custom hours
								</label>
							</div>
						</div>

						{#if !ovBlocked}
							<div class="field">
								<div class="book-ovform__times">
									<div class="field">
										<Label for="ov-start" class="field__label field__label--required">Start</Label>
										<input
											id="ov-start"
											type="time"
											bind:value={ovStart}
											required
											class="book-time"
										/>
									</div>
									<div class="field">
										<Label for="ov-end" class="field__label field__label--required">End</Label>
										<input id="ov-end" type="time" bind:value={ovEnd} required class="book-time" />
									</div>
								</div>
								{#if ovErrors.end_time}<p class="field__error">{ovErrors.end_time}</p>{/if}
							</div>
						{/if}

						<div class="field">
							<Label for="ov-reason" class="field__label">Reason (internal)</Label>
							<Input id="ov-reason" bind:value={ovReason} maxlength={500} placeholder="Optional" />
						</div>

						<div class="book-ovform__actions">
							<Button
								variant="outline"
								onclick={() => {
									resetOverrideForm();
									showOverrideForm = false;
								}}
							>
								Cancel
							</Button>
							<Button type="submit">Add to list</Button>
						</div>
					</form>
				{/if}

				{#if overrides.length > 0}
					<ul class="book-overrides">
						{#each overrides as o (o.key)}
							<li class="book-override">
								<div class="book-override__main">
									<p class="book-override__date">{formatOverrideDate(o.override_date)}</p>
									<p class="book-override__detail">
										{#if o.is_blocked}
											Blocked all day
										{:else}
											Custom: {o.start_time} – {o.end_time}
										{/if}
										{#if o.reason}
											· {o.reason}
										{/if}
									</p>
								</div>
								<button
									type="button"
									class="book-iconbtn book-iconbtn--sm"
									onclick={() => removeOverride(o.key)}
									aria-label="Remove from list"
								>
									<i class="ri-close-line" aria-hidden="true"></i>
								</button>
							</li>
						{/each}
					</ul>
					<p class="book-overrides-note">
						{overrides.length}
						{overrides.length === 1 ? 'date' : 'dates'} will be blocked.
					</p>
				{/if}

				<div class="book-actions">
					<Button variant="outline" onclick={goBack} disabled={submitting}>
						<i class="ri-arrow-left-line" aria-hidden="true"></i> Back
					</Button>
					<Button
						type="button"
						loadingLabel="Creating…"
						successLabel="Created"
						loading={submitting}
						onclick={() => submit(false)}
					>
						Create Booking Page
					</Button>
				</div>
			</div>
		{/if}
	</PageWrapper>
{:else}
	<!-- ============================================================ -->
	<!-- SUCCESS SCREEN                                                -->
	<!-- ============================================================ -->
	<PageWrapper title="Booking page created" subtitle={created.title} back="/settings/booking">
		<div class="book-form">
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Public booking URL</p>
						<p class="settings-card__desc">Share this link with customers.</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="book-urlchip book-urlchip--strong">
						<i class="ri-link" aria-hidden="true"></i>
						<span>{publicUrl}</span>
					</div>
					<div class="book-card__actions">
						<Button onclick={copyUrl}>
							<i class="ri-file-copy-line" aria-hidden="true"></i> Copy link
						</Button>
						<Button href={publicUrl} variant="outline" target="_blank" rel="noopener">
							<i class="ri-external-link-line" aria-hidden="true"></i> View booking page
						</Button>
						<Button variant="outline" onclick={() => goto(`/settings/booking/${created!.id}`)}>
							<i class="ri-settings-3-line" aria-hidden="true"></i> Edit settings
						</Button>
					</div>
				</div>
			</div>

			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Summary</p>
					</div>
				</div>
				<dl class="book-summary">
					<div class="book-summary__row">
						<dt class="book-summary__term">Slot duration</dt>
						<dd class="book-summary__val">{created.slot_duration_minutes} min</dd>
					</div>
					<div class="book-summary__row">
						<dt class="book-summary__term">Buffer between bookings</dt>
						<dd class="book-summary__val">
							{created.buffer_minutes === 0 ? 'None' : `${created.buffer_minutes} min`}
						</dd>
					</div>
					<div class="book-summary__row">
						<dt class="book-summary__term">Minimum advance</dt>
						<dd class="book-summary__val">
							{created.min_advance_hours === 1 ? '1 hour' : `${created.min_advance_hours} hours`}
						</dd>
					</div>
					<div class="book-summary__row">
						<dt class="book-summary__term">Booking horizon</dt>
						<dd class="book-summary__val">{created.max_future_days} days</dd>
					</div>
					<div class="book-summary__row">
						<dt class="book-summary__term">Weekly availability</dt>
						<dd class="book-summary__val">{availabilitySummary}</dd>
					</div>
					<div class="book-summary__row">
						<dt class="book-summary__term">Blocked dates</dt>
						<dd class="book-summary__val">
							{overrides.length}
							{overrides.length === 1 ? 'date' : 'dates'}
						</dd>
					</div>
				</dl>
			</div>

			<div class="book-actions book-actions--end">
				<Button variant="outline" onclick={() => goto('/settings/booking')}>Done</Button>
			</div>
		</div>
	</PageWrapper>
{/if}
