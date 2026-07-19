<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import ContactPicker from '$lib/components/shared/ContactPicker.svelte';
	import type { ContactHit } from '$lib/components/shared/contactPicker';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import RequestAssessmentEditor from '$lib/components/requests/RequestAssessmentEditor.svelte';
	import { requestsStore } from '$lib/stores/requests.svelte';
	import { requestStatsStore } from '$lib/stores/requestStats.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	const MAX_PHOTOS = 10;

	// ── Seed from query params (e.g. the calendar "New › Request › More options"
	//    hand-off carries title + client + schedule so nothing typed is lost). ──
	const params = page.url.searchParams;
	function seedDate(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}
	function seedTime(d: Date): string {
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}
	const seedTitle = params.get('title') ?? '';
	const seedInstructions = params.get('instructions') ?? '';
	const seedContactId = params.get('contact_id');
	const seedContactName = params.get('contact_name');
	const seedContact: ContactHit | null =
		seedContactId && seedContactName
			? { id: seedContactId, full_name: seedContactName, phone: null, email: null }
			: null;
	const seedStart = params.get('start');
	const seedEnd = params.get('end');
	const seedAllDay = params.get('all_day') === '1';
	const seedStartDate = seedStart ? new Date(seedStart) : null;
	const seedEndDate = seedEnd ? new Date(seedEnd) : null;

	// ── Header ───────────────────────────────────────────────────────────────
	let title = $state(seedTitle);
	let contact = $state<ContactHit | null>(seedContact);
	const requestedOn = new Date().toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	// ── Overview ─────────────────────────────────────────────────────────────
	let serviceDetails = $state('');

	// Photos are STAGED locally (the request doesn't exist until save), then
	// uploaded with the new request_id right after the POST succeeds.
	type StagedPhoto = { id: string; file: File; previewUrl: string };
	let photos = $state<StagedPhoto[]>([]);
	let photoInput: HTMLInputElement | undefined = $state();

	function addPhotos(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files) return;
		for (const file of files) {
			if (photos.length >= MAX_PHOTOS) {
				toast.error(`Up to ${MAX_PHOTOS} photos per request`);
				break;
			}
			if (!file.type.startsWith('image/')) {
				toast.error(`${file.name} is not an image`);
				continue;
			}
			photos = [
				...photos,
				{
					id: Math.random().toString(36).slice(2),
					file,
					previewUrl: URL.createObjectURL(file)
				}
			];
		}
		input.value = '';
	}

	function removePhoto(id: string) {
		const p = photos.find((x) => x.id === id);
		if (p) URL.revokeObjectURL(p.previewUrl);
		photos = photos.filter((x) => x.id !== id);
	}

	// ── On-site assessment ───────────────────────────────────────────────────
	// Open the assessment pre-filled if a schedule was carried over from the calendar.
	let assessmentOpen = $state(!!seedStartDate);
	let instructions = $state(seedInstructions);
	let startDate = $state(seedStartDate ? seedDate(seedStartDate) : '');
	let endDate = $state(seedEndDate ? seedDate(seedEndDate) : '');
	let startTime = $state(seedStartDate && !seedAllDay ? seedTime(seedStartDate) : '');
	let endTime = $state(seedEndDate && !seedAllDay ? seedTime(seedEndDate) : '');
	let scheduleLater = $state(false);
	let anytime = $state(seedAllDay);
	let crewIds = $state<string[]>([]);
	let leadId = $state<string | null>(null);

	// ── Product / Service ────────────────────────────────────────────────────
	let lineItems = $state<QuoteLineDraft[]>([]);
	let catalogOpen = $state(false);
	let lineControls = $state<{ addItem: () => void; addSection: () => void } | undefined>(undefined);

	const realLines = $derived(lineItems.filter((l) => l.description.trim().length > 0));
	const subtotal = $derived(
		realLines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
	);

	// ── Notes ────────────────────────────────────────────────────────────────
	let notesOpen = $state(false);
	let notes = $state('');

	// ── Save ─────────────────────────────────────────────────────────────────
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	function validate(): boolean {
		const errs: Record<string, string> = {};
		if (!title.trim()) errs.title = 'Title is required';
		if (!contact) errs.contact_id = 'Select a client';
		if (assessmentOpen && !scheduleLater) {
			if (!startDate) errs.startDate = 'Pick a start date';
			else if (!anytime) {
				if (!startTime) errs.startDate = 'Pick a start time';
				else if (!endTime) errs.endTime = 'Pick an end time';
				else {
					const s = new Date(`${startDate}T${startTime}`);
					const e = new Date(`${endDate || startDate}T${endTime}`);
					if (e.getTime() <= s.getTime()) errs.endTime = 'End must be after start';
				}
			}
		}
		fieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function createAssessment(requestId: string): Promise<boolean> {
		const payload: Record<string, unknown> = {
			contact_id: contact!.id,
			request_id: requestId,
			type: 'estimate',
			title: title.trim(),
			all_day: anytime,
			scheduled_start: scheduleLater
				? null
				: anytime
					? new Date(`${startDate}T00:00:00`).toISOString()
					: new Date(`${startDate}T${startTime}`).toISOString(),
			scheduled_end:
				scheduleLater || anytime
					? null
					: new Date(`${endDate || startDate}T${endTime}`).toISOString(),
			notes: instructions.trim() || null,
			assignee_ids: crewIds,
			lead_member_id: leadId
		};
		const res = await fetch('/api/appointments', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return res.ok;
	}

	async function uploadPhoto(requestId: string, photo: StagedPhoto): Promise<boolean> {
		const formData = new FormData();
		formData.append('file', photo.file);
		formData.append('purpose_tag', 'request_photo');
		formData.append('request_id', requestId);
		const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
		return res.ok;
	}

	async function save() {
		if (saving) return;
		if (!validate()) {
			toast.error('Fix the highlighted fields');
			return;
		}
		saving = true;
		try {
			const res = await fetch('/api/requests', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contact_id: contact!.id,
					title: title.trim(),
					service_details: serviceDetails.trim() || null,
					notes: notes.trim() || null,
					line_items: realLines.map((l) => ({
						line_key: l.line_key,
						description: l.description.trim(),
						details: l.details?.trim() || null,
						quantity: Number(l.quantity) || 1,
						unit: l.unit?.trim() || null,
						unit_price: Number(l.unit_price) || 0,
						unit_cost: l.unit_cost != null && l.unit_cost !== '' ? Number(l.unit_cost) : null,
						taxable: l.taxable ?? true,
						source_catalog_item_id: l.source_catalog_item_id ?? null
					}))
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors) fieldErrors = body.field_errors;
				toast.error(body.error ?? 'Failed to create request');
				return;
			}
			const requestId = (body.data as { id: string }).id;

			// Assessment + photos are independent of each other — one wave.
			const followUps: Promise<boolean>[] = [];
			if (assessmentOpen && (scheduleLater || startDate)) {
				followUps.push(createAssessment(requestId));
			}
			for (const p of photos) followUps.push(uploadPhoto(requestId, p));
			const results = await Promise.all(followUps);
			const failed = results.filter((ok) => !ok).length;

			requestsStore.invalidate();
			requestStatsStore.invalidate();
			if (failed > 0) {
				toast.info(
					`Request created, but ${failed} follow-up step${failed === 1 ? '' : 's'} failed — check it from the list.`
				);
			} else {
				toast.success('Request created');
			}
			goto('/requests');
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New Request</title></svelte:head>

<PageWrapper title="New Request" subtitle="Capture incoming work from a client">
	<div class="request-new">
		<!-- ── Header card: title + client + requested on ──────────────────── -->
		<section class="request-new__card">
			<input
				class="request-new__title"
				class:request-new__title--invalid={!!fieldErrors.title}
				bind:value={title}
				placeholder="Title"
				maxlength="200"
				oninput={() => delete fieldErrors.title}
			/>
			{#if fieldErrors.title}
				<p class="request-new__error">{fieldErrors.title}</p>
			{/if}

			<div class="request-new__header-row">
				<div class="request-new__picker">
					<ContactPicker
						bind:selected={contact}
						invalid={!!fieldErrors.contact_id}
						onSelect={() => delete fieldErrors.contact_id}
					/>
					{#if fieldErrors.contact_id}
						<p class="request-new__error">{fieldErrors.contact_id}</p>
					{/if}
				</div>
				<div class="request-new__requested">
					<span class="request-new__requested-label">Requested on</span>
					<span class="request-new__requested-value">{requestedOn}</span>
				</div>
			</div>
		</section>

		<!-- ── Overview ─────────────────────────────────────────────────────── -->
		<section class="request-new__card">
			<h2 class="request-new__section-title">Overview</h2>
			<label class="request-new__label" for="request-service-details">Service details</label>
			<p class="request-new__hint">Please provide as much information as you can</p>
			<textarea
				id="request-service-details"
				class="request-new__textarea"
				bind:value={serviceDetails}
				rows="4"
			></textarea>

			<div class="request-new__photos-head">
				<span class="request-new__label">Share images of the work to be done</span>
				<span class="request-new__photos-count">{photos.length}/{MAX_PHOTOS}</span>
			</div>
			<div class="request-new__photos">
				{#each photos as photo (photo.id)}
					<div class="request-new__photo">
						<img src={photo.previewUrl} alt={photo.file.name} />
						<button
							type="button"
							class="request-new__photo-remove"
							onclick={() => removePhoto(photo.id)}
							aria-label="Remove photo"
						>
							<i class="ri-close-line" aria-hidden="true"></i>
						</button>
					</div>
				{/each}
				{#if photos.length < MAX_PHOTOS}
					<button
						type="button"
						class="request-new__photo-add"
						onclick={() => photoInput?.click()}
						aria-label="Add photos"
					>
						<i class="ri-image-add-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>
			<input
				type="file"
				accept="image/*"
				multiple
				hidden
				bind:this={photoInput}
				onchange={addPhotos}
			/>
		</section>

		<!-- ── On-site assessment ───────────────────────────────────────────── -->
		<section class="request-new__card">
			<div class="request-new__section-head">
				<h2 class="request-new__section-title">On-site assessment</h2>
				{#if assessmentOpen}
					<button
						type="button"
						class="request-new__section-close"
						onclick={() => (assessmentOpen = false)}
						aria-label="Remove assessment"
					>
						<i class="ri-close-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>

			{#if assessmentOpen}
				<RequestAssessmentEditor
					bind:instructions
					bind:startDate
					bind:endDate
					bind:startTime
					bind:endTime
					bind:scheduleLater
					bind:anytime
					bind:selectedIds={crewIds}
					bind:leadId
					errors={fieldErrors}
				/>
			{:else}
				<button type="button" class="request-new__placeholder" onclick={() => (assessmentOpen = true)}>
					<span class="request-new__placeholder-icon">
						<i class="ri-truck-line" aria-hidden="true"></i>
					</span>
					<span>Visit the property to assess the job before you do the work</span>
				</button>
			{/if}
		</section>

		<!-- ── Product / Service ────────────────────────────────────────────── -->
		<section class="request-new__card">
			<h2 class="request-new__section-title">Product / Service</h2>
			<p class="request-new__hint">Keep everything on track by adding products and services.</p>
			<div class="request-new__line-actions">
				<Button type="button" onclick={() => lineControls?.addItem()}>
					<i class="ri-add-line" aria-hidden="true"></i>
					Add line item
				</Button>
				<Button type="button" variant="secondary" onclick={() => (catalogOpen = true)}>
					<i class="ri-book-2-line" aria-hidden="true"></i>
					Add from price book
				</Button>
			</div>

			<LineItemEditor
				bind:lineItems
				enableCatalog
				hoistActions
				bind:catalogOpen
				bind:controls={lineControls}
			/>

			<div class="request-new__totals">
				<div class="request-new__totals-row">
					<span>Subtotal</span>
					<span>{formatCurrency(subtotal)}</span>
				</div>
				<div class="request-new__totals-row request-new__totals-row--total">
					<span>Total</span>
					<span>{formatCurrency(subtotal)}</span>
				</div>
			</div>
		</section>

		<!-- ── Notes ────────────────────────────────────────────────────────── -->
		<section class="request-new__card">
			<h2 class="request-new__section-title">Notes</h2>
			{#if notesOpen}
				<textarea
					class="request-new__textarea"
					bind:value={notes}
					rows="3"
					placeholder="Internal note for yourself or a team member"
				></textarea>
			{:else}
				<button type="button" class="request-new__placeholder" onclick={() => (notesOpen = true)}>
					<span class="request-new__placeholder-icon">
						<i class="ri-sticky-note-add-line" aria-hidden="true"></i>
					</span>
					<span>Leave an internal note for yourself or a team member</span>
				</button>
			{/if}
		</section>

		<!-- ── Footer ───────────────────────────────────────────────────────── -->
		<div class="request-new__footer">
			<Button type="button" variant="secondary" onclick={() => goto('/requests')}>Cancel</Button>
			<Button type="button" loading={saving} loadingLabel="Saving…" onclick={save}>
				Save request
			</Button>
		</div>
	</div>
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.request-new {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		max-width: 960px;

		&__card {
			background: var(--color-bg-surface);
			border: 1px solid var(--color-border);
			border-radius: $radius-lg;
			padding: $space-5;
			display: flex;
			flex-direction: column;
			gap: $space-3;
		}

		&__title {
			width: 100%;
			padding: $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-text-primary);
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			font-family: inherit;

			&:focus {
				outline: none;
				border-color: var(--color-brand);
			}
			&--invalid {
				border-color: var(--danger-solid);
			}
		}

		&__header-row {
			display: grid;
			grid-template-columns: 1fr;
			gap: $space-3;
			align-items: start;

			@media (min-width: $bp-tablet) {
				grid-template-columns: 1fr auto;
			}
		}

		&__picker {
			min-width: 0;
		}

		&__requested {
			display: flex;
			gap: $space-3;
			align-items: baseline;
		}

		&__requested-label {
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__requested-value {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
		}

		&__section-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
		}

		&__section-title {
			margin: 0;
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__section-close {
			border: none;
			background: none;
			color: var(--color-text-secondary);
			font-size: 1.8rem;
			cursor: pointer;
			line-height: 1;

			&:hover {
				color: var(--color-text-primary);
			}
		}

		&__label {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__hint {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__textarea {
			width: 100%;
			padding: $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-text-primary);
			font-size: $fs-body;
			font-family: inherit;
			resize: vertical;

			&:focus {
				outline: none;
				border-color: var(--color-brand);
			}
		}

		&__photos-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
		}

		&__photos-count {
			font-size: $fs-caption;
			color: var(--color-text-secondary);
		}

		&__photos {
			display: flex;
			flex-wrap: wrap;
			gap: $space-2;
		}

		&__photo {
			position: relative;
			width: 88px;
			height: 88px;
			border-radius: $radius-md;
			overflow: hidden;
			border: 1px solid var(--color-border);

			img {
				width: 100%;
				height: 100%;
				object-fit: cover;
				display: block;
			}
		}

		&__photo-remove {
			position: absolute;
			top: 4px;
			right: 4px;
			width: 22px;
			height: 22px;
			border: none;
			border-radius: $radius-full;
			background: rgba(0, 0, 0, 0.55);
			color: #fff;
			display: grid;
			place-items: center;
			cursor: pointer;
			font-size: 1.4rem;
		}

		&__photo-add {
			width: 88px;
			height: 88px;
			border: 1px dashed var(--color-border-strong);
			border-radius: $radius-md;
			background: none;
			color: var(--color-text-secondary);
			font-size: 2rem;
			cursor: pointer;
			display: grid;
			place-items: center;

			&:hover {
				border-color: var(--color-brand);
				color: var(--color-brand);
			}
		}

		&__placeholder {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: $space-3;
			width: 100%;
			padding: $space-8 $space-4;
			border: 1px dashed var(--color-border-strong);
			border-radius: $radius-md;
			background: none;
			color: var(--color-text-secondary);
			font-size: $fs-body;
			cursor: pointer;

			&:hover {
				border-color: var(--color-brand);
				color: var(--color-text-primary);
			}
		}

		&__placeholder-icon {
			width: 48px;
			height: 48px;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			display: grid;
			place-items: center;
			font-size: 2rem;
			color: var(--color-text-secondary);
		}

		&__line-actions {
			display: flex;
			gap: $space-2;
			flex-wrap: wrap;
		}

		&__totals {
			margin-left: auto;
			width: 100%;
			max-width: 360px;
			display: flex;
			flex-direction: column;
			gap: $space-2;
			padding-top: $space-3;
			border-top: 1px solid var(--color-border);
		}

		&__totals-row {
			display: flex;
			justify-content: space-between;
			font-size: $fs-body;
			color: var(--color-text-secondary);

			&--total {
				font-weight: $weight-semibold;
				color: var(--color-text-primary);
				border-top: 1px solid var(--color-border);
				padding-top: $space-2;
			}
		}

		&__error {
			margin: 0;
			font-size: $fs-caption;
			color: var(--danger-solid);
		}

		&__footer {
			display: flex;
			justify-content: flex-end;
			gap: $space-2;
		}
	}
</style>
