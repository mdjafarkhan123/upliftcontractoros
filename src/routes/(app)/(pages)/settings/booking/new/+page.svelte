<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Switch } from '$lib/components/ui/switch';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { getOrgContext } from '$lib/context/org';
	import { bookingPublicUrl } from '$lib/components/booking/publicUrl';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		Copy,
		ExternalLink,
		Link2,
		Loader2,
		Plus,
		Settings,
		X
	} from '@lucide/svelte';

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
</script>

<svelte:head><title>New booking link</title></svelte:head>

{#if !created}
	<PageWrapper
		title="New booking link"
		subtitle="Configure how customers book this appointment type."
		back="/settings/booking"
	>
		<!-- Stepper -->
		<ol class="mb-6 flex items-center gap-2 text-xs sm:text-sm">
			{#each STEP_LABELS as label, i (label)}
				{@const n = (i + 1) as Step}
				{@const done = step > n}
				{@const active = step === n}
				<li class="flex items-center gap-2">
					<span
						class={[
							'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors',
							done
								? 'border-primary bg-primary text-primary-foreground'
								: active
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border bg-muted/40 text-muted-foreground'
						].join(' ')}
					>
						{#if done}
							<Check class="h-3.5 w-3.5" />
						{:else}
							{n}
						{/if}
					</span>
					<span
						class={[
							'whitespace-nowrap',
							active ? 'font-semibold text-foreground' : 'text-muted-foreground'
						].join(' ')}
					>
						{label}{#if n === 3}<span class="ml-1 text-muted-foreground/70">(Optional)</span>{/if}
					</span>
				</li>
				{#if i < STEP_LABELS.length - 1}
					<li class="h-px flex-1 bg-border" aria-hidden="true"></li>
				{/if}
			{/each}
		</ol>

		{#if errorMsg}
			<div
				class="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
			>
				{errorMsg}
			</div>
		{/if}

		<!-- ============================================================ -->
		<!-- STEP 1: Booking Details                                       -->
		<!-- ============================================================ -->
		{#if step === 1}
			<div class="space-y-4">
				<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
					<div class="border-b border-border/60 px-5 py-3.5">
						<p class="text-sm font-semibold text-foreground">Link Details</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							What customers see on your booking page
						</p>
					</div>
					<div class="space-y-4 px-5 py-5">
						<div class="space-y-1.5">
							<Label for="title">Title <span class="text-destructive">*</span></Label>
							<Input id="title" bind:value={title} required maxlength={120} />
							<p class="text-xs text-muted-foreground">Shown to customers on the booking page.</p>
							{#if fieldErrors.title}
								<p class="text-xs text-destructive">{fieldErrors.title}</p>
							{/if}
						</div>

						<div class="space-y-1.5">
							<Label for="slug">URL slug <span class="text-destructive">*</span></Label>
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
							<div
								class="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2"
							>
								<Link2 class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
								<span class="break-all font-mono text-xs text-muted-foreground">{previewUrl}</span>
							</div>
							{#if normalizedSlug && slugState === 'checking'}
								<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
									<Loader2 class="h-3 w-3 animate-spin" /> Checking availability…
								</p>
							{:else if slugState === 'available'}
								<p class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
									<Check class="h-3 w-3" /> Available
								</p>
							{:else if slugState === 'taken'}
								<p class="flex items-center gap-1.5 text-xs text-destructive">
									<X class="h-3 w-3" /> Already in use — try another.
								</p>
							{:else if slugState === 'too_short' && normalizedSlug}
								<p class="text-xs text-muted-foreground">
									{3 - normalizedSlug.length} more character{3 - normalizedSlug.length === 1
										? ''
										: 's'} to check availability.
								</p>
							{:else if slugState === 'invalid'}
								<p class="text-xs text-destructive">
									Use lowercase letters, numbers, and hyphens only.
								</p>
							{:else if slugState === 'error'}
								<p class="text-xs text-muted-foreground">
									Couldn't check availability — we'll verify on submit.
								</p>
							{/if}
							{#if fieldErrors.slug}
								<p class="text-xs text-destructive">{fieldErrors.slug}</p>
							{/if}
						</div>

						<div class="space-y-1.5">
							<Label for="description">Description</Label>
							<Textarea id="description" bind:value={description} maxlength={2000} rows={3} />
						</div>

						<div class="space-y-1.5">
							<Label for="appointment_type"
								>Appointment type <span class="text-destructive">*</span></Label
							>
							<Select.Root bind:value={appointment_type}>
								<Select.Trigger class="h-11 w-full">
									<Select.Value />
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="estimate">Estimate</Select.Item>
									<Select.Item value="job_start">Job start</Select.Item>
									<Select.Item value="follow_up">Follow up</Select.Item>
									<Select.Item value="inspection">Inspection</Select.Item>
									<Select.Item value="other">Other</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
					<div class="border-b border-border/60 px-5 py-3.5">
						<p class="text-sm font-semibold text-foreground">Schedule Settings</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Control timing and availability rules
						</p>
					</div>
					<div class="px-5 py-5">
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<div class="space-y-1.5">
								<Label for="slot">Slot duration <span class="text-destructive">*</span></Label>
								<Select.Root bind:value={slot_duration_minutes}>
									<Select.Trigger class="h-11 w-full">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={30}>30 min</Select.Item>
										<Select.Item value={45}>45 min</Select.Item>
										<Select.Item value={60}>60 min</Select.Item>
										<Select.Item value={90}>90 min</Select.Item>
										<Select.Item value={120}>120 min</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>

							<div class="space-y-1.5">
								<Label for="buffer"
									>Buffer between bookings <span class="text-destructive">*</span></Label
								>
								<Select.Root bind:value={buffer_minutes}>
									<Select.Trigger class="h-11 w-full">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={0}>None</Select.Item>
										<Select.Item value={15}>15 min</Select.Item>
										<Select.Item value={30}>30 min</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>

							<div class="space-y-1.5">
								<Label for="advance"
									>Minimum advance notice <span class="text-destructive">*</span></Label
								>
								<Select.Root bind:value={min_advance_hours}>
									<Select.Trigger class="h-11 w-full">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={1}>1 hour</Select.Item>
										<Select.Item value={4}>4 hours</Select.Item>
										<Select.Item value={24}>24 hours</Select.Item>
										<Select.Item value={48}>48 hours</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>

							<div class="space-y-1.5">
								<Label for="horizon">Booking horizon <span class="text-destructive">*</span></Label>
								<Select.Root bind:value={max_future_days}>
									<Select.Trigger class="h-11 w-full">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value={14}>14 days</Select.Item>
										<Select.Item value={30}>30 days</Select.Item>
										<Select.Item value={60}>60 days</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					</div>
				</div>

				<div class="flex justify-between gap-2 pt-2">
					<Button
						variant="outline"
						type="button"
						onclick={() => goto('/settings/booking')}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onclick={goNext}
						disabled={submitting ||
							slugState === 'checking' ||
							slugState === 'taken' ||
							slugState === 'invalid' ||
							slugState === 'too_short' ||
							slugState === 'idle'}
					>
						Next <ArrowRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{/if}

		<!-- ============================================================ -->
		<!-- STEP 2: Availability                                          -->
		<!-- ============================================================ -->
		{#if step === 2}
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">
					Choose the days and time windows when customers can book.
				</p>

				{#each days as d (d.day_of_week)}
					<div class="rounded-xl border border-border bg-card p-4">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="text-sm font-semibold text-foreground">{DAY_NAMES[d.day_of_week]}</p>
								<p class="text-xs text-muted-foreground">
									{d.enabled ? 'Available' : 'Unavailable'}
								</p>
							</div>
							<Switch checked={d.enabled} onCheckedChange={(v: boolean) => toggleDay(d, v)} />
						</div>

						{#if d.enabled}
							<div class="mt-4 space-y-2">
								{#each d.windows as w, i (i)}
									<div class="flex items-center gap-2">
										<input
											type="time"
											bind:value={w.start}
											class="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
										/>
										<span class="text-sm text-muted-foreground">–</span>
										<input
											type="time"
											bind:value={w.end}
											class="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											class="h-11 w-11"
											onclick={() => removeWindow(d, i)}
											aria-label="Remove window"
										>
											<X class="h-4 w-4" />
										</Button>
									</div>
								{/each}
								<Button type="button" variant="outline" size="sm" onclick={() => addWindow(d)}>
									<Plus class="h-3.5 w-3.5" /> Add window
								</Button>
							</div>
						{/if}
					</div>
				{/each}

				<div class="flex justify-between gap-2 pt-2">
					<Button variant="outline" type="button" onclick={goBack} disabled={submitting}>
						<ArrowLeft class="h-4 w-4" /> Back
					</Button>
					<Button type="button" onclick={goNext} disabled={submitting}>
						Next <ArrowRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{/if}

		<!-- ============================================================ -->
		<!-- STEP 3: Blocked Dates (optional)                              -->
		<!-- ============================================================ -->
		{#if step === 3}
			<div class="space-y-4">
				<div class="rounded-xl border border-border/60 bg-muted/30 p-4">
					<p class="text-sm font-semibold text-foreground">Blocked dates are optional</p>
					<p class="mt-1 text-xs text-muted-foreground">
						Block specific days (holidays, vacations) or set custom hours for one-off dates. You can
						also add these later.
					</p>
				</div>

				{#if !showOverrideForm}
					<Button type="button" onclick={() => (showOverrideForm = true)}>
						<Plus class="h-4 w-4" /> Block a date
					</Button>
				{:else}
					<form
						class="space-y-4 rounded-xl border border-border bg-card p-4"
						onsubmit={addOverride}
					>
						<div class="space-y-1.5">
							<Label for="ov-date">Date <span class="text-destructive">*</span></Label>
							<Calendar bind:value={ovDate} placeholder="Pick a date" min={today} />
							{#if ovErrors.override_date}
								<p class="text-xs text-destructive">{ovErrors.override_date}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label>Type <span class="text-destructive">*</span></Label>
							<div class="grid grid-cols-2 gap-2">
								<label
									class={[
										'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm',
										ovBlocked ? 'border-primary bg-primary/5' : 'border-border'
									].join(' ')}
								>
									<input
										type="radio"
										name="block-type"
										checked={ovBlocked}
										onchange={() => (ovBlocked = true)}
									/>
									Block all day
								</label>
								<label
									class={[
										'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm',
										!ovBlocked ? 'border-primary bg-primary/5' : 'border-border'
									].join(' ')}
								>
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
							<div class="grid grid-cols-2 gap-2">
								<div class="space-y-1.5">
									<Label for="ov-start">Start <span class="text-destructive">*</span></Label>
									<input
										id="ov-start"
										type="time"
										bind:value={ovStart}
										required
										class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
									/>
								</div>
								<div class="space-y-1.5">
									<Label for="ov-end">End <span class="text-destructive">*</span></Label>
									<input
										id="ov-end"
										type="time"
										bind:value={ovEnd}
										required
										class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
									/>
								</div>
								{#if ovErrors.end_time}
									<p class="col-span-2 text-xs text-destructive">{ovErrors.end_time}</p>
								{/if}
							</div>
						{/if}

						<div class="space-y-1.5">
							<Label for="ov-reason">Reason (internal)</Label>
							<Input id="ov-reason" bind:value={ovReason} maxlength={500} placeholder="Optional" />
						</div>

						<div class="flex justify-end gap-2">
							<Button
								type="button"
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
					<ul class="grid gap-2">
						{#each overrides as o (o.key)}
							<li
								class="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
							>
								<div class="min-w-0 flex-1">
									<p class="text-sm font-semibold text-foreground">
										{formatOverrideDate(o.override_date)}
									</p>
									<p class="mt-0.5 text-xs text-muted-foreground">
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
								<Button
									variant="ghost"
									size="icon"
									class="h-9 w-9"
									onclick={() => removeOverride(o.key)}
									aria-label="Remove from list"
								>
									<X class="h-4 w-4" />
								</Button>
							</li>
						{/each}
					</ul>
					<p class="text-xs text-muted-foreground">
						{overrides.length}
						{overrides.length === 1 ? 'date' : 'dates'} will be blocked.
					</p>
				{/if}

				<div class="flex flex-wrap justify-between gap-2 pt-2">
					<Button variant="outline" type="button" onclick={goBack} disabled={submitting}>
						<ArrowLeft class="h-4 w-4" /> Back
					</Button>
					<JetEngineButton
						type="button"
						label="Create Booking Page"
						loadingLabel="Creating…"
						successLabel="Created"
						state={submitting ? 'loading' : 'idle'}
						onclick={() => submit(false)}
					/>
				</div>
			</div>
		{/if}
	</PageWrapper>
{:else}
	<!-- ============================================================ -->
	<!-- SUCCESS SCREEN                                                -->
	<!-- ============================================================ -->
	<PageWrapper title="Booking page created" subtitle={created.title} back="/settings/booking">
		<div class="space-y-4">
			<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
				<div class="border-b border-border/60 px-5 py-3.5">
					<p class="text-sm font-semibold text-foreground">Public booking URL</p>
					<p class="mt-0.5 text-xs text-muted-foreground">Share this link with customers.</p>
				</div>
				<div class="space-y-3 px-5 py-5">
					<div
						class="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5"
					>
						<Link2 class="h-4 w-4 shrink-0 text-muted-foreground/70" />
						<span class="flex-1 break-all font-mono text-xs text-foreground">{publicUrl}</span>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button type="button" onclick={copyUrl}>
							<Copy class="h-4 w-4" /> Copy link
						</Button>
						<Button type="button" variant="outline" href={publicUrl} target="_blank" rel="noopener">
							<ExternalLink class="h-4 w-4" /> View booking page
						</Button>
						<Button
							type="button"
							variant="outline"
							onclick={() => goto(`/settings/booking/${created!.id}`)}
						>
							<Settings class="h-4 w-4" /> Edit settings
						</Button>
					</div>
				</div>
			</div>

			<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
				<div class="border-b border-border/60 px-5 py-3.5">
					<p class="text-sm font-semibold text-foreground">Summary</p>
				</div>
				<dl class="divide-y divide-border/60 text-sm">
					<div class="flex items-start justify-between gap-3 px-5 py-3">
						<dt class="text-muted-foreground">Slot duration</dt>
						<dd class="font-medium text-foreground">{created.slot_duration_minutes} min</dd>
					</div>
					<div class="flex items-start justify-between gap-3 px-5 py-3">
						<dt class="text-muted-foreground">Buffer between bookings</dt>
						<dd class="font-medium text-foreground">
							{created.buffer_minutes === 0 ? 'None' : `${created.buffer_minutes} min`}
						</dd>
					</div>
					<div class="flex items-start justify-between gap-3 px-5 py-3">
						<dt class="text-muted-foreground">Minimum advance</dt>
						<dd class="font-medium text-foreground">
							{created.min_advance_hours === 1 ? '1 hour' : `${created.min_advance_hours} hours`}
						</dd>
					</div>
					<div class="flex items-start justify-between gap-3 px-5 py-3">
						<dt class="text-muted-foreground">Booking horizon</dt>
						<dd class="font-medium text-foreground">{created.max_future_days} days</dd>
					</div>
					<div class="flex items-start justify-between gap-3 px-5 py-3">
						<dt class="text-muted-foreground">Weekly availability</dt>
						<dd class="text-right font-medium text-foreground">{availabilitySummary}</dd>
					</div>
					<div class="flex items-start justify-between gap-3 px-5 py-3">
						<dt class="text-muted-foreground">Blocked dates</dt>
						<dd class="font-medium text-foreground">
							{overrides.length}
							{overrides.length === 1 ? 'date' : 'dates'}
						</dd>
					</div>
				</dl>
			</div>

			<div class="flex justify-end">
				<Button variant="outline" type="button" onclick={() => goto('/settings/booking')}>
					Done
				</Button>
			</div>
		</div>
	</PageWrapper>
{/if}
