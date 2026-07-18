<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Calendar from '$lib/components/booking/Calendar.svelte';
	// (no navigation — the confirmation screen renders inline as the final step)
	import TimeSlots from '$lib/components/booking/TimeSlots.svelte';
	import PhoneField from '$lib/components/shared/PhoneField.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Calendar as DateField } from '$lib/components/ui/calendar';
	import {
		fieldConfig,
		customTypeIsMulti,
		type StandardFieldConfig,
		type PublicCustomField
	} from '$lib/types/bookingForms';

	type Config = {
		org_name: string;
		org_timezone: string;
		org_country: string | null;
		title: string;
		slot_duration_minutes: number;
		requires_approval: boolean;
		// Per-form field config (R5.2). Which optional fields to show/require.
		// Undefined ⇒ every configurable field falls back to its default.
		fields?: StandardFieldConfig[];
		// Contractor-added custom questions (R5.2b), rendered on the service-details step.
		custom_fields?: PublicCustomField[];
	};

	type Props = {
		config: Config;
		orgSlug: string;
		bookingSlug: string;
		apiBase: string;
		// Settings live-preview mode: inert (no network, no submit), steps 1–2 only.
		preview?: boolean;
	};

	let { config, orgSlug, bookingSlug, apiBase, preview = false }: Props = $props();

	// Effective per-field config (show/hide + required) driving both this live form
	// and the settings preview. `config.fields` is reactive so the preview reflects
	// toggle changes instantly.
	const companyCfg = $derived(fieldConfig(config.fields, 'company_name'));
	const emailCfg = $derived(fieldConfig(config.fields, 'email'));
	const addressCfg = $derived(fieldConfig(config.fields, 'address'));
	const photosCfg = $derived(fieldConfig(config.fields, 'photos'));
	const leadCfg = $derived(fieldConfig(config.fields, 'lead_source'));

	// 1 Contact · 2 Service details · 3 Schedule · 4 Review · 5 Confirmation
	let step = $state<1 | 2 | 3 | 4 | 5>(1);
	const STEP_COUNT = 4; // progress bar segments (confirmation has no bar)

	// ── Contact ──────────────────────────────────────────────────────────────
	let firstName = $state('');
	let lastName = $state('');
	let companyName = $state('');
	let email = $state('');
	let phone = $state('');
	let marketingEmailOptIn = $state(false);
	let marketingSmsOptIn = $state(false);
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let stateProv = $state('');
	let zip = $state('');

	// ── Service details ──────────────────────────────────────────────────────
	let serviceDetails = $state('');
	let leadSource = $state('');
	let website = $state(''); // honeypot — must stay empty

	// ── Custom questions (R5.2b) ──────────────────────────────────────────────
	// Answers keyed by field id: a string for single-value types, string[] for
	// multi-value types (checkbox / multi-dropdown).
	const customFields = $derived(config.custom_fields ?? []);
	let customAnswers = $state<Record<string, string | string[]>>({});

	function textAnswer(fieldId: string): string {
		const v = customAnswers[fieldId];
		return typeof v === 'string' ? v : '';
	}

	function multiAnswer(fieldId: string): string[] {
		const v = customAnswers[fieldId];
		return Array.isArray(v) ? v : [];
	}

	function setText(fieldId: string, value: string) {
		customAnswers[fieldId] = value;
	}

	function toggleMulti(fieldId: string, option: string, checked: boolean) {
		const cur = multiAnswer(fieldId);
		customAnswers[fieldId] = checked ? [...cur, option] : cur.filter((o) => o !== option);
	}

	function isAnswered(f: PublicCustomField): boolean {
		return customTypeIsMulti(f.type)
			? multiAnswer(f.id).length > 0
			: textAnswer(f.id).trim() !== '';
	}

	// Human-readable answer for the review step.
	function answerSummary(f: PublicCustomField): string {
		return customTypeIsMulti(f.type) ? multiAnswer(f.id).join(', ') : textAnswer(f.id).trim();
	}

	// ── Photos ("Share images of the work to be done", cap 10) ────────────────
	// Staged locally as File objects; uploaded AFTER the request is created (a media
	// row needs a request_id parent), exactly like the internal New Request page.
	type StagedPhoto = { id: string; file: File; previewUrl: string };
	const PHOTO_CAP = 10;
	const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
	let photos = $state<StagedPhoto[]>([]);
	let photoInput: HTMLInputElement | undefined = $state();
	let photoNote = $state<string | null>(null);

	function pickPhotos() {
		if (submitting) return;
		photoInput?.click();
	}

	function handlePhotoChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const files = target.files;
		if (files) {
			for (const file of files) {
				if (photos.length >= PHOTO_CAP) break;
				if (!file.type.startsWith('image/')) continue;
				photos.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
			}
		}
		target.value = ''; // allow re-selecting the same file
	}

	function removePhoto(id: string) {
		if (submitting) return;
		const idx = photos.findIndex((p) => p.id === id);
		if (idx === -1) return;
		URL.revokeObjectURL(photos[idx].previewUrl);
		photos.splice(idx, 1);
	}

	// Best-effort upload of one staged photo to the public request-photo endpoint.
	// Returns true on success; failures are non-fatal (the request already exists).
	async function uploadPhoto(file: File, requestId: string): Promise<boolean> {
		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('request_id', requestId);
			const res = await fetch(`${apiBase}/submit-request/photos`, { method: 'POST', body: fd });
			return res.ok;
		} catch {
			return false;
		}
	}

	const LEAD_SOURCE_OPTIONS = [
		'Google',
		'Referral from friend or family',
		'Facebook',
		'Instagram',
		'Nextdoor',
		'Yelp',
		'Angi',
		'Saw your vehicle or job sign',
		'Repeat customer',
		'Other'
	];
	const leadSourceItems = LEAD_SOURCE_OPTIONS.map((o) => ({ value: o, label: o }));

	// ── Schedule ─────────────────────────────────────────────────────────────
	function currentMonthInTz(tz: string): string {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit'
		}).format(new Date());
	}

	let month = $state<string>('');
	const availableDatesByMonth = new SvelteMap<string, Set<string>>();
	let datesLoading = $state(false);

	onMount(() => {
		month = currentMonthInTz(config.org_timezone);
	});
	let selectedDate = $state<string | null>(null);
	let slots = $state<string[]>([]);
	let slotsLoading = $state(false);
	let selectedSlot = $state<string | null>(null);
	let datesLoaded = $state(false);

	const availableDatesForMonth = $derived(availableDatesByMonth.get(month) ?? new Set<string>());

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

	const selectedSlotLabel = $derived(
		selectedSlot
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

	const durationLabel = $derived(
		config.slot_duration_minutes % 60 === 0
			? `${config.slot_duration_minutes / 60}h`
			: `${config.slot_duration_minutes} min`
	);

	async function loadDates(targetMonth: string) {
		if (availableDatesByMonth.has(targetMonth)) return;
		datesLoading = true;
		try {
			const res = await fetch(`${apiBase}/dates?month=${targetMonth}`);
			const body = res.ok ? await res.json() : null;
			const dates: string[] = body?.data?.dates ?? [];
			availableDatesByMonth.set(targetMonth, new Set(dates));
		} catch {
			availableDatesByMonth.set(targetMonth, new Set());
		} finally {
			datesLoading = false;
		}
	}

	async function ensureDatesLoaded() {
		if (datesLoaded) return;
		datesLoaded = true;
		await loadDates(month);
	}

	async function handleMonthChange(newMonth: string) {
		month = newMonth;
		await loadDates(newMonth);
	}

	async function handleSelectDate(date: string) {
		selectedDate = date;
		selectedSlot = null;
		slots = [];
		slotsLoading = true;
		try {
			const res = await fetch(`${apiBase}/slots?date=${date}`);
			const body = res.ok ? await res.json() : null;
			slots = body?.data?.slots ?? [];
		} catch {
			slots = [];
		} finally {
			slotsLoading = false;
		}
	}

	function handleSelectSlot(iso: string) {
		selectedSlot = iso;
	}

	// ── Validation + navigation ──────────────────────────────────────────────
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});
	let submitting = $state(false);

	// Inputs are inert while submitting or in preview.
	const busy = $derived(submitting || preview);

	function validateContact(): boolean {
		const e: Record<string, string> = {};
		if (!firstName.trim()) e.firstName = 'Required';
		if (!lastName.trim()) e.lastName = 'Required';
		if (!phone.trim()) e.customerPhone = 'Required';
		if (companyCfg.enabled && companyCfg.required && !companyName.trim())
			e.companyName = 'Required';
		if (emailCfg.enabled) {
			if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
				e.email = 'Enter a valid email';
			else if (emailCfg.required && !email.trim()) e.email = 'Required';
		}
		if (addressCfg.enabled && addressCfg.required) {
			if (!addressLine1.trim()) e.addressLine1 = 'Required';
			if (!city.trim()) e.city = 'Required';
			if (!stateProv.trim()) e.state = 'Required';
			if (!zip.trim()) e.zip = 'Required';
		}
		fieldErrors = e;
		return Object.keys(e).length === 0;
	}

	function validateService(): boolean {
		const e: Record<string, string> = {};
		if (!serviceDetails.trim()) e.serviceDetails = 'Required';
		if (leadCfg.enabled && leadCfg.required && !leadSource) e.leadSourceAnswer = 'Required';
		for (const f of customFields) {
			if (f.required && !isAnswered(f)) e[`custom_${f.id}`] = 'Required';
		}
		fieldErrors = e;
		return Object.keys(e).length === 0;
	}

	async function next() {
		errorMsg = null;
		// Preview: inert navigation across the two field steps only.
		if (preview) {
			if (step < 2) step = (step + 1) as typeof step;
			return;
		}
		if (step === 1) {
			if (!validateContact()) return;
			step = 2;
		} else if (step === 2) {
			if (!validateService()) return;
			step = 3;
			await ensureDatesLoaded();
		} else if (step === 3) {
			if (!selectedSlot) {
				errorMsg = 'Please choose a date and time.';
				return;
			}
			step = 4;
		}
	}

	function back() {
		errorMsg = null;
		if (step > 1) step = (step - 1) as typeof step;
	}

	async function submit() {
		if (preview || submitting || !selectedSlot || !selectedDate) return;
		submitting = true;
		errorMsg = null;
		fieldErrors = {};
		try {
			const res = await fetch(`${apiBase}/submit-request`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					companyName: companyName.trim() || undefined,
					email: email.trim() || undefined,
					customerPhone: phone.trim(),
					marketingEmailOptIn,
					marketingSmsOptIn,
					addressLine1: addressLine1.trim(),
					addressLine2: addressLine2.trim() || undefined,
					city: city.trim(),
					state: stateProv.trim(),
					zip: zip.trim(),
					serviceDetails: serviceDetails.trim(),
					leadSourceAnswer: leadSource || undefined,
					customAnswers: customFields.map((f) => ({
						field_id: f.id,
						value: customTypeIsMulti(f.type)
							? multiAnswer(f.id)
							: textAnswer(f.id).trim() || null
					})),
					date: selectedDate,
					slotStart: selectedSlot,
					website,
					source:
						typeof document !== 'undefined' && document.referrer ? document.referrer : undefined
				})
			});
			const body = await res.json().catch(() => ({}));
			if (res.status === 409) {
				errorMsg = body.error ?? 'This time is no longer available.';
				selectedSlot = null;
				step = 3;
				if (selectedDate) await handleSelectDate(selectedDate);
				return;
			}
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				errorMsg = body.error ?? 'Could not submit your request. Please try again.';
				// Jump back to the step owning the first errored field.
				const keys = Object.keys(fieldErrors);
				if (
					keys.some(
						(k) => ['serviceDetails', 'leadSourceAnswer'].includes(k) || k.startsWith('custom_')
					)
				)
					step = 2;
				else if (keys.some((k) => ['date', 'slotStart'].includes(k))) step = 3;
				else if (keys.length > 0) step = 1;
				return;
			}

			// Request created. Upload any staged photos best-effort — the request already
			// exists, so a photo failure never blocks the confirmation.
			const requestId = body?.data?.requestId as string | undefined;
			if (requestId && photos.length > 0) {
				const results = await Promise.all(photos.map((p) => uploadPhoto(p.file, requestId)));
				const failed = results.filter((ok) => !ok).length;
				if (failed > 0) {
					photoNote =
						failed === photos.length
							? "We couldn't upload your photos, but your request was sent."
							: `Your request was sent, but ${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded.`;
				}
			}
			step = 5;
		} catch {
			errorMsg = 'Could not submit your request. Please try again.';
		} finally {
			submitting = false;
		}
	}

	const addressSummary = $derived(
		[addressLine1.trim(), addressLine2.trim(), city.trim(), stateProv.trim(), zip.trim()]
			.filter(Boolean)
			.join(', ')
	);
</script>

{#if step !== 5}
	<div class="book-portal__steps">
		{#each Array.from({ length: STEP_COUNT }, (_, i) => i + 1) as n (n)}
			<div class="book-portal__step {n <= step ? 'book-portal__step--active' : ''}"></div>
		{/each}
	</div>
{/if}

{#if step === 5}
	<!-- ── Confirmation ── -->
	<div class="req-done">
		<div class="req-done__icon">
			<i class="ri-checkbox-circle-fill" aria-hidden="true"></i>
		</div>
		<h2 class="req-done__title">
			{#if config.requires_approval}
				Your request was sent and is awaiting confirmation
			{:else}
				Your request has been received
			{/if}
		</h2>
		<p class="req-done__lead">
			{#if config.requires_approval}
				Appointment time and date may be adjusted for availability. You will receive a confirmation
				by email or text.
			{:else}
				We&rsquo;ve got your details and will be in touch shortly.
			{/if}
		</p>
		<div class="req-done__card">
			<p class="req-done__card-name">{firstName} {lastName}</p>
			<p class="req-done__card-line">{selectedSlotLabel}</p>
			{#if addressSummary}
				<p class="req-done__card-line">{addressSummary}</p>
			{/if}
		</div>
		{#if photoNote}
			<p class="req-done__note">{photoNote}</p>
		{/if}
	</div>
{:else}
	<section class="book-portal__card">
		{#if step > 1}
			<button type="button" class="book-portal__back" onclick={back} disabled={submitting}>
				<i class="ri-arrow-left-s-line" aria-hidden="true"></i> Back
			</button>
		{/if}

		<!-- All field controls sit in a fieldset so preview/submit disables them in
		     one place (native fieldset[disabled] cascades). Nav buttons stay outside. -->
		<fieldset class="req-fieldset" disabled={busy}>
		{#if step === 1}
			<!-- ── Contact information ── -->
			<h2 class="req-step__title">Contact information</h2>
			<div class="bk-form">
				<div aria-hidden="true" class="bk-form__honeypot">
					<label>
						Website
						<input type="text" tabindex="-1" autocomplete="off" bind:value={website} />
					</label>
				</div>

				<div class="req-grid req-grid--2">
					<div class="bk-form__field">
						<label for="req-fn" class="bk-form__label">
							First name <span class="bk-form__req">*</span>
						</label>
						<input
							id="req-fn"
							type="text"
							autocomplete="given-name"
							bind:value={firstName}
							disabled={submitting}
							class="bk-form__input {fieldErrors.firstName ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.firstName}<p class="bk-form__field-error">
								{fieldErrors.firstName}
							</p>{/if}
					</div>
					<div class="bk-form__field">
						<label for="req-ln" class="bk-form__label">
							Last name <span class="bk-form__req">*</span>
						</label>
						<input
							id="req-ln"
							type="text"
							autocomplete="family-name"
							bind:value={lastName}
							disabled={submitting}
							class="bk-form__input {fieldErrors.lastName ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.lastName}<p class="bk-form__field-error">
								{fieldErrors.lastName}
							</p>{/if}
					</div>
				</div>

				{#if companyCfg.enabled}
					<div class="bk-form__field">
						<label for="req-co" class="bk-form__label">
							Company name
							{#if companyCfg.required}<span class="bk-form__req">*</span>{:else}<span
									class="bk-form__opt">(optional)</span
								>{/if}
						</label>
						<input
							id="req-co"
							type="text"
							autocomplete="organization"
							bind:value={companyName}
							disabled={submitting}
							class="bk-form__input {fieldErrors.companyName ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.companyName}<p class="bk-form__field-error">
								{fieldErrors.companyName}
							</p>{/if}
					</div>
				{/if}

				{#if emailCfg.enabled}
					<div class="bk-form__field">
						<label for="req-email" class="bk-form__label">
							Email
							{#if emailCfg.required}<span class="bk-form__req">*</span>{:else}<span
									class="bk-form__opt">(optional)</span
								>{/if}
						</label>
						<input
							id="req-email"
							type="email"
							autocomplete="email"
							bind:value={email}
							disabled={submitting}
							class="bk-form__input {fieldErrors.email ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.email}<p class="bk-form__field-error">{fieldErrors.email}</p>{/if}
					</div>

					<label class="req-check">
						<input type="checkbox" bind:checked={marketingEmailOptIn} disabled={submitting} />
						<span
							>I&rsquo;d like to receive marketing emails from {config.org_name}. Unsubscribe at
							any time.</span
						>
					</label>
				{/if}

				<div class="bk-form__field">
					<label for="req-phone" class="bk-form__label">
						Phone number <span class="bk-form__req">*</span>
					</label>
					<PhoneField
						id="req-phone"
						required
						bind:value={phone}
						defaultCountry={config.org_country ?? 'US'}
						invalid={!!fieldErrors.customerPhone}
						disabled={submitting}
					/>
					{#if fieldErrors.customerPhone}<p class="bk-form__field-error">
							{fieldErrors.customerPhone}
						</p>{/if}
				</div>

				<p class="req-consent">
					By providing your phone number, you agree to receive appointment reminders and other
					transactional text messages (SMS) from {config.org_name}. You can unsubscribe at any time
					by replying STOP. Message and data rates may apply.
				</p>
				<label class="req-check">
					<input type="checkbox" bind:checked={marketingSmsOptIn} disabled={submitting} />
					<span
						>I also agree to receive marketing SMS from {config.org_name}. Reply STOP MKT to opt
						out.</span
					>
				</label>

				{#if addressCfg.enabled}
				<div class="req-address-head">
					Street address {#if addressCfg.required}<span class="bk-form__req">*</span>{/if}
				</div>

				<div class="bk-form__field">
					<label for="req-a1" class="bk-form__label"
						>Street address {#if addressCfg.required}<span class="bk-form__req">*</span>{/if}</label
					>
					<input
						id="req-a1"
						type="text"
						autocomplete="address-line1"
						bind:value={addressLine1}
						disabled={submitting}
						class="bk-form__input {fieldErrors.addressLine1 ? 'bk-form__input--error' : ''}"
					/>
					{#if fieldErrors.addressLine1}<p class="bk-form__field-error">
							{fieldErrors.addressLine1}
						</p>{/if}
				</div>

				<div class="bk-form__field">
					<label for="req-a2" class="bk-form__label">
						Unit, apartment, suite, etc. <span class="bk-form__opt">(optional)</span>
					</label>
					<input
						id="req-a2"
						type="text"
						autocomplete="address-line2"
						bind:value={addressLine2}
						disabled={submitting}
						class="bk-form__input"
					/>
				</div>

				<div class="req-grid req-grid--3">
					<div class="bk-form__field">
						<label for="req-city" class="bk-form__label"
							>City {#if addressCfg.required}<span class="bk-form__req">*</span>{/if}</label
						>
						<input
							id="req-city"
							type="text"
							autocomplete="address-level2"
							bind:value={city}
							disabled={submitting}
							class="bk-form__input {fieldErrors.city ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.city}<p class="bk-form__field-error">{fieldErrors.city}</p>{/if}
					</div>
					<div class="bk-form__field">
						<label for="req-state" class="bk-form__label"
							>State / Province {#if addressCfg.required}<span class="bk-form__req">*</span>{/if}</label
						>
						<input
							id="req-state"
							type="text"
							autocomplete="address-level1"
							bind:value={stateProv}
							disabled={submitting}
							class="bk-form__input {fieldErrors.state ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.state}<p class="bk-form__field-error">{fieldErrors.state}</p>{/if}
					</div>
					<div class="bk-form__field">
						<label for="req-zip" class="bk-form__label"
							>Postal code {#if addressCfg.required}<span class="bk-form__req">*</span>{/if}</label
						>
						<input
							id="req-zip"
							type="text"
							autocomplete="postal-code"
							bind:value={zip}
							disabled={submitting}
							class="bk-form__input {fieldErrors.zip ? 'bk-form__input--error' : ''}"
						/>
						{#if fieldErrors.zip}<p class="bk-form__field-error">{fieldErrors.zip}</p>{/if}
					</div>
				</div>
				{/if}
			</div>
		{:else if step === 2}
			<!-- ── Service details ── -->
			<h2 class="req-step__title">Service details</h2>
			<div class="bk-form">
				<div class="bk-form__field">
					<label for="req-details" class="bk-form__label">
						Please provide as much information as you can <span class="bk-form__req">*</span>
					</label>
					<textarea
						id="req-details"
						rows="5"
						bind:value={serviceDetails}
						disabled={submitting}
						class="bk-form__textarea {fieldErrors.serviceDetails ? 'bk-form__input--error' : ''}"
					></textarea>
					{#if fieldErrors.serviceDetails}<p class="bk-form__field-error">
							{fieldErrors.serviceDetails}
						</p>{/if}
				</div>

				{#if photosCfg.enabled}
				<div class="bk-form__field">
					<div class="req-photos__head">
						<span class="bk-form__label">
							Share images of the work to be done <span class="bk-form__opt">(optional)</span>
						</span>
						<span class="req-photos__count">{photos.length}/{PHOTO_CAP}</span>
					</div>
					<div class="req-photos__grid">
						{#each photos as photo (photo.id)}
							<div class="req-photos__thumb">
								<img src={photo.previewUrl} alt="" />
								<button
									type="button"
									class="req-photos__remove"
									onclick={() => removePhoto(photo.id)}
									disabled={submitting}
									aria-label="Remove photo"
								>
									<i class="ri-close-line" aria-hidden="true"></i>
								</button>
							</div>
						{/each}
						{#if photos.length < PHOTO_CAP}
							<button
								type="button"
								class="req-photos__add"
								onclick={pickPhotos}
								disabled={submitting}
								aria-label="Add photos"
							>
								<i class="ri-image-add-line" aria-hidden="true"></i>
							</button>
						{/if}
					</div>
					<input
						bind:this={photoInput}
						type="file"
						multiple
						accept={PHOTO_ACCEPT}
						class="req-photos__input"
						onchange={handlePhotoChange}
					/>
				</div>
				{/if}

				{#if leadCfg.enabled}
				<div class="bk-form__field">
					<label class="bk-form__label" for="req-lead">
						How did you hear about us? {#if leadCfg.required}<span class="bk-form__req">*</span>{:else}<span class="bk-form__opt">(optional)</span>{/if}
					</label>
					<Select.Root bind:value={leadSource} items={leadSourceItems}>
						<Select.Trigger id="req-lead">
							<Select.Value placeholder="Choose an option" />
						</Select.Trigger>
						<Select.Content>
							{#each LEAD_SOURCE_OPTIONS as opt (opt)}
								<Select.Item value={opt} label={opt}>{opt}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					{#if fieldErrors.leadSourceAnswer}<p class="bk-form__field-error">{fieldErrors.leadSourceAnswer}</p>{/if}
				</div>
				{/if}

				<!-- ── Custom questions (R5.2b) ── -->
				{#each customFields as f (f.id)}
					{@const err = fieldErrors[`custom_${f.id}`]}
					<div class="bk-form__field">
						<span class="bk-form__label" id={`cq-${f.id}-label`}>
							{f.label}
							{#if f.required}<span class="bk-form__req">*</span>{:else}<span class="bk-form__opt">(optional)</span>{/if}
						</span>
						{#if f.help_text}<p class="req-cq__help">{f.help_text}</p>{/if}

						{#if f.type === 'short_text'}
							<input
								type="text"
								value={textAnswer(f.id)}
								oninput={(e) => setText(f.id, e.currentTarget.value)}
								placeholder={f.placeholder ?? ''}
								disabled={submitting}
								class="bk-form__input {err ? 'bk-form__input--error' : ''}"
							/>
						{:else if f.type === 'long_text'}
							<textarea
								rows="4"
								value={textAnswer(f.id)}
								oninput={(e) => setText(f.id, e.currentTarget.value)}
								placeholder={f.placeholder ?? ''}
								disabled={submitting}
								class="bk-form__textarea {err ? 'bk-form__input--error' : ''}"
							></textarea>
						{:else if f.type === 'number'}
							<input
								type="text"
								inputmode="decimal"
								value={textAnswer(f.id)}
								oninput={(e) => setText(f.id, e.currentTarget.value)}
								placeholder={f.placeholder ?? ''}
								disabled={submitting}
								class="bk-form__input {err ? 'bk-form__input--error' : ''}"
							/>
						{:else if f.type === 'date'}
							<DateField
								value={textAnswer(f.id)}
								onValueChange={(v: string) => setText(f.id, v)}
								placeholder="Pick a date"
								disabled={busy}
							/>
						{:else if f.type === 'dropdown_single'}
							<Select.Root
								value={textAnswer(f.id)}
								onValueChange={(v: string) => setText(f.id, v)}
								items={f.options.map((o) => ({ value: o, label: o }))}
								disabled={busy}
							>
								<Select.Trigger><Select.Value placeholder="Choose an option" /></Select.Trigger>
								<Select.Content>
									{#each f.options as opt (opt)}
										<Select.Item value={opt} label={opt}>{opt}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						{:else if f.type === 'radio' || f.type === 'yes_no'}
							{@const opts = f.type === 'yes_no' ? ['Yes', 'No'] : f.options}
							<div class="req-cq__choices" role="radiogroup" aria-labelledby={`cq-${f.id}-label`}>
								{#each opts as opt (opt)}
									<label class="req-cq__choice">
										<input
											type="radio"
											name={`cq-${f.id}`}
											value={opt}
											checked={textAnswer(f.id) === opt}
											onchange={() => setText(f.id, opt)}
											disabled={submitting}
										/>
										<span>{opt}</span>
									</label>
								{/each}
							</div>
						{:else if f.type === 'checkbox' || f.type === 'dropdown_multi'}
							<div class="req-cq__choices" role="group" aria-labelledby={`cq-${f.id}-label`}>
								{#each f.options as opt (opt)}
									<label class="req-cq__choice">
										<input
											type="checkbox"
											value={opt}
											checked={multiAnswer(f.id).includes(opt)}
											onchange={(e) => toggleMulti(f.id, opt, e.currentTarget.checked)}
											disabled={submitting}
										/>
										<span>{opt}</span>
									</label>
								{/each}
							</div>
						{/if}
						{#if err}<p class="bk-form__field-error">{err}</p>{/if}
					</div>
				{/each}
			</div>
		{:else if step === 3}
			<!-- ── Schedule ── -->
			<h2 class="req-step__title">Schedule an appointment</h2>
			<p class="req-step__sub">
				Choose a date and time <span class="bk-form__req">*</span> · Estimated duration: {durationLabel}
			</p>
			<Calendar
				{month}
				availableDates={availableDatesForMonth}
				loading={datesLoading}
				{selectedDate}
				timezone={config.org_timezone}
				onSelectDate={handleSelectDate}
				onChangeMonth={handleMonthChange}
			/>
			{#if selectedDate}
				<div class="req-slots">
					<div class="book-portal__date-head">
						<div class="book-portal__date-icon">
							<i class="ri-calendar-event-line" aria-hidden="true"></i>
						</div>
						<div>
							<h3 class="book-portal__date-title">{selectedDateLabel}</h3>
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
			{/if}
		{:else if step === 4}
			<!-- ── Review ── -->
			<h2 class="req-step__title">Review</h2>
			<div class="req-review">
				<div class="req-review__group">
					<p class="req-review__group-title">Contact information</p>
					<dl class="req-review__list">
						<div class="req-review__row">
							<dt>Full name</dt>
							<dd>{firstName} {lastName}</dd>
						</div>
						{#if companyName.trim()}
							<div class="req-review__row">
								<dt>Company</dt>
								<dd>{companyName}</dd>
							</div>
						{/if}
						{#if email.trim()}
							<div class="req-review__row">
								<dt>Email</dt>
								<dd>{email}</dd>
							</div>
						{/if}
						<div class="req-review__row">
							<dt>Phone</dt>
							<dd>{phone}</dd>
						</div>
						<div class="req-review__row">
							<dt>Address</dt>
							<dd>{addressSummary}</dd>
						</div>
					</dl>
				</div>
				<div class="req-review__group">
					<p class="req-review__group-title">Service details</p>
					<dl class="req-review__list">
						<div class="req-review__row">
							<dt>Details</dt>
							<dd>{serviceDetails}</dd>
						</div>
						{#if leadSource}
							<div class="req-review__row">
								<dt>Heard about us</dt>
								<dd>{leadSource}</dd>
							</div>
						{/if}
						{#if photos.length > 0}
							<div class="req-review__row">
								<dt>Photos</dt>
								<dd>{photos.length} attached</dd>
							</div>
						{/if}
						{#each customFields as f (f.id)}
							{#if isAnswered(f)}
								<div class="req-review__row">
									<dt>{f.label}</dt>
									<dd>{answerSummary(f)}</dd>
								</div>
							{/if}
						{/each}
					</dl>
				</div>
				<div class="req-review__group">
					<p class="req-review__group-title">Appointment</p>
					<dl class="req-review__list">
						<div class="req-review__row">
							<dt>Preferred time</dt>
							<dd>{selectedSlotLabel}</dd>
						</div>
					</dl>
				</div>
			</div>
		{/if}

		</fieldset>

		{#if preview}
			<p class="req-preview-note">
				This is a preview. Clients fill this out, then pick a time and review before submitting.
			</p>
		{/if}

		{#if errorMsg}
			<div class="bk-form__error req-error">{errorMsg}</div>
		{/if}

		{#if step === 4}
			<button type="button" class="bk-form__submit" onclick={submit} disabled={submitting}>
				{#if submitting}
					<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
					<span>Submitting…</span>
				{:else}
					<span>Submit request</span>
				{/if}
			</button>
		{:else if step === 3}
			<button
				type="button"
				class="bk-form__submit"
				onclick={next}
				disabled={submitting || !selectedSlot}
			>
				Next
			</button>
		{:else}
			<button
				type="button"
				class="bk-form__submit"
				onclick={next}
				disabled={submitting || (preview && step === 2)}>Next</button
			>
		{/if}
	</section>

	<p class="book-portal__tz">Times shown in {config.org_timezone.replace(/_/g, ' ')}</p>
{/if}
