<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import EditPencil from '$lib/components/shared/EditPencil.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import InlineEditRow from '$lib/components/shared/InlineEditRow.svelte';
	import { InlineEditController } from '$lib/components/shared/inlineEditController.svelte';
	import { monthCellsOf } from '$lib/jobs/recurrence';
	import JobStatusBadge from '$lib/components/jobs/JobStatusBadge.svelte';
	import RequestBacklink from '$lib/components/requests/RequestBacklink.svelte';
	import JobLineItemsSection from '$lib/components/jobs/JobLineItemsSection.svelte';
	import JobTasksSection from '$lib/components/jobs/JobTasksSection.svelte';
	import JobFormsSection from '$lib/components/jobs/JobFormsSection.svelte';
	import JobCustomFieldsSection from '$lib/components/jobs/JobCustomFieldsSection.svelte';
	import JobTimeTrackingSection from '$lib/components/jobs/JobTimeTrackingSection.svelte';
	import JobCostingSection from '$lib/components/jobs/JobCostingSection.svelte';
	import JobBillingSection from '$lib/components/jobs/JobBillingSection.svelte';
	import JobBillingSettingsDialog from '$lib/components/jobs/JobBillingSettingsDialog.svelte';
	import JobScheduleEditor from '$lib/components/jobs/JobScheduleEditor.svelte';
	import JobProductsPricing from '$lib/components/jobs/JobProductsPricing.svelte';
	import type { InvoiceFrequency } from '$lib/jobs/billing';
	import JobLinksSection from '$lib/components/jobs/JobLinksSection.svelte';
	import JobVisitsSection from '$lib/components/jobs/JobVisitsSection.svelte';
	import JobSignoffSection from '$lib/components/jobs/JobSignoffSection.svelte';
	import JobReviewIndicator from '$lib/components/jobs/JobReviewIndicator.svelte';
	import OnMyWayDialog from '$lib/components/jobs/OnMyWayDialog.svelte';
	import JobClientCard from '$lib/components/jobs/JobClientCard.svelte';
	import JobTagsEditor from '$lib/components/jobs/JobTagsEditor.svelte';
	import JobCategoryPicker from '$lib/components/jobs/JobCategoryPicker.svelte';
	import RecurringScheduleModal from '$lib/components/jobs/RecurringScheduleModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import EditActionBar from '$lib/components/shared/EditActionBar.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { JobDetail, JobStatus, AppointmentStatusJobEcho } from '$lib/types/jobs';
	import type { QuoteLineDraft } from '$lib/types/quotes';
	import { JobFormState, defaultNotifyChannel } from '$lib/jobs/jobForm.svelte';
	import MediaGallery from '$lib/components/media/MediaGallery.svelte';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const id = $derived(data.id);

	// One shared form brain — the same model the New Job page uses, so the create and edit
	// screens can't drift apart. Edit-only concerns (dirty guard, notify-on-reschedule,
	// recurrence-rebuild confirm, status actions, PATCH) stay in this page below.
	const form = new JobFormState();

	$effect(() => {
		void jobDetailStore.load(id);
	});

	const job = $derived(jobDetailStore.get(id));
	const seed = $derived(jobsStore.getById(id));
	const loadingCold = $derived(jobDetailStore.isLoading(id) && !seed);
	const errorMsg = $derived(jobDetailStore.getError(id));

	const canFullPipeline = $derived(member().can_view_full_pipeline);
	const canEdit = $derived.by(() => {
		const m = member();
		if (!job) return false;
		if (m.can_view_full_pipeline) return true;
		if (m.can_view_assigned_jobs) return job.assigned_to === m.id;
		return false;
	});
	// Inline pencils follow the same gate as the global Edit button: editable rights AND the
	// job is still open (the API rejects edits on a closed/archived job).
	const canInlineEdit = $derived(canEdit && job?.status === 'active');
	const canCancel = $derived(member().can_view_full_pipeline);
	const canInvoice = $derived(member().can_create_invoices);
	// A recurring job bills on a schedule (S4); a one-off job uses the payment schedule (S3).
	// Reads the STORED type: an "as needed" job has no rule but is still recurring, so testing
	// `!!job.recurrence` here used to mis-read it as one-off and show the wrong billing rail.
	const isRecurring = $derived(job?.job_type === 'recurring');
	// Separate question from `isRecurring`: does this job's scheduled_start hold a frozen series
	// anchor / job window instead of a real visit date? True whenever a repeat rule exists — which
	// a ONE-OFF job may also have — or the job is "as needed". Only the status badge needs it.
	const hasSeriesAnchor = $derived(!!job?.recurrence || !!job?.schedule_as_needed);

	const headerVM = $derived.by(() => {
		if (job) return { contact_name: job.contact_name, title: job.title, status: job.status };
		if (seed) return { contact_name: seed.contact_name, title: seed.title, status: seed.status };
		return null;
	});

	// Read-only job facts the shared "Schedule a visit" modal renders in its Job details panel.
	const visitJobInfo = $derived.by(() => {
		if (!job) return null;
		const address =
			[
				job.service_address_line_1,
				job.service_address_line_2,
				[job.service_address_city, job.service_address_state, job.service_address_zip]
					.filter(Boolean)
					.join(', ')
			]
				.filter(Boolean)
				.join(' · ') || null;
		return {
			title: job.title,
			jobNumber: null,
			contactId: job.contact_id,
			contactName: job.contact_name,
			contactPhone: job.contact_phone,
			address
		};
	});

	// ── Assignees ────────────────────────────────────────────────────────────────
	let assigneesLoaded = $state(false);
	$effect(() => {
		if (!canFullPipeline || assigneesLoaded) return;
		assigneesLoaded = true;
		void fetch('/api/contacts/assignees').then(async (r) => {
			if (!r.ok) return;
			const a = (await r.json()) as { assignees: { id: string; full_name: string }[] };
			form.assignees = a.assignees;
		});
	});

	// ── Edit-only schedule-change tracking ───────────────────────────────────────
	// The start the job loaded with — notify the client only when the start actually moves.
	let originalStartISO = $state<string | null>(null);
	// The recurrence rule the job loaded with — used to detect a real change on save.
	let originalRecurrenceJSON = $state('null');

	function toInputValue(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function rateToPct(rate: string): string {
		const r = Number(rate);
		return r > 0 ? String(Math.round(r * 10000) / 100) : '';
	}

	function draftsFromJob(j: JobDetail): QuoteLineDraft[] {
		return j.line_items.map((li) => ({
			client_id: crypto.randomUUID(),
			line_key: li.line_key,
			description: li.description,
			details: li.details ?? '',
			quantity: li.quantity,
			unit: li.unit ?? '',
			section_label: li.section_label,
			unit_price: li.unit_price,
			unit_cost: li.unit_cost,
			taxable: li.taxable,
			source_catalog_item_id: li.source_catalog_item_id
		}));
	}

	function resetFormFromJob(j: JobDetail) {
		form.title = j.title;
		form.assignedToId = j.assigned_to ?? '';
		form.scheduleLater = !j.scheduled_start;
		form.scheduledStart = toInputValue(j.scheduled_start);
		form.scheduledEnd = toInputValue(j.scheduled_end);
		form.anytime = false;
		originalStartISO = j.scheduled_start;
		form.notifyChannel = defaultNotifyChannel(!!j.contact_phone, !!j.contact_email);
		form.scopeOfWork = j.scope_of_work ?? '';
		form.notes = j.notes ?? '';
		form.jobCategory = j.job_category ?? '';
		form.tags = [...(j.tags ?? [])];
		form.lineItems = draftsFromJob(j);
		form.discountType = (j.discount_type as 'none' | 'fixed' | 'percent') ?? 'none';
		form.discountValue = j.discount_value ?? '';
		form.discountLabel = j.discount_label ?? '';
		form.taxRatePct = rateToPct(j.tax_rate);
		// Billing model (Jobber billingType × billingFrequency).
		form.billingType = j.billing_type;
		form.billingFrequency = j.billing_frequency;
		form.invoiceFrequency = (j.invoice_frequency as InvoiceFrequency) ?? 'weekly';
		// Jobber "Invoice frequency" repeat rule (periodic billing). Seeds the recurrence modal /
		// dropdown; null → the canned monthly-last-day default.
		form.hydrateInvoiceRecurrence(j.invoice_recurrence);
		form.splitEnabled = j.payment_milestones.length > 0;
		form.splitBy = (j.payment_milestones[0]?.amount_type as 'percent' | 'fixed') ?? 'percent';
		form.billingMilestones = j.payment_milestones.map((m) => ({
			client_id: crypto.randomUUID(),
			key: m.key,
			description: m.description,
			amount_value: m.amount_value,
			due_date: m.due_date,
			// Already-invoiced rows are locked: the editor renders them read-only and the
			// server preserves them on save regardless of the payload.
			locked: !!m.invoice_id
		}));
		form.addrLine1 = j.service_address_line_1 ?? '';
		form.addrLine2 = j.service_address_line_2 ?? '';
		form.addrCity = j.service_address_city ?? '';
		form.addrState = j.service_address_state ?? '';
		form.addrZip = j.service_address_zip ?? '';
		// Recurring schedule: seed the modal shape + end condition from the saved rule.
		// The job record has no single visit_instructions (it lives per-visit), so that
		// field always starts blank on edit — same as creation.
		const rec = j.recurrence;
		originalRecurrenceJSON = JSON.stringify(rec ?? null);
		form.visitInstructions = '';
		if (rec) {
			form.jobMode = 'recurring';
			form.recurConfigured = true;
			form.anytime = rec.anytime ?? false;
			form.recurShape = {
				freq: rec.freq,
				interval: rec.interval,
				weekdays: rec.weekdays ?? [],
				month_mode: rec.month_mode ?? 'day_of_month',
				month_days: rec.month_days ?? [],
				month_last_day: rec.month_last_day ?? false,
				// Legacy rules stored weeks × weekdays as two lists; monthCellsOf flattens them
				// into the grid's cells so an old job opens with the right squares lit.
				month_cells: monthCellsOf(rec)
			};
			form.endType = rec.end_type;
			form.endAfterCount = rec.end_after_count ? String(rec.end_after_count) : '6';
			form.endAfterUnit = rec.end_after_unit ?? 'months';
			form.endOn = rec.end_on ?? '';
		} else {
			form.jobMode = 'one_off';
			form.recurConfigured = false;
			form.recurShape = {
				freq: 'week',
				interval: 1,
				weekdays: [],
				month_mode: 'day_of_month',
				month_days: [],
				month_last_day: false,
				month_cells: []
			};
			form.endType = 'after';
			form.endAfterCount = '6';
			form.endAfterUnit = 'months';
			form.endOn = '';
		}
		// Jobber "As needed": recurring-by-intent with no rule and no visits, but WITH a stored
		// job window (start date + end boundary). Overrides the one-off defaults the (null)
		// recurrence set above so the editor re-opens in As-needed mode with its window.
		form.scheduleAsNeeded = j.schedule_as_needed;
		if (j.schedule_as_needed) {
			form.jobMode = 'recurring';
			form.scheduleLater = false;
			form.recurConfigured = false;
			// Start is a noon-anchored day bucket — show the date, leave the time blank; the end
			// boundary lives in the Ends-on field, NOT the day end-time field.
			form.scheduledStart = toInputValue(j.scheduled_start).split('T')[0];
			form.scheduledEnd = '';
			// The stored boundary reads back as an "Ends on" date (an "Ends after N" input was
			// converted to its concrete date on save).
			if (j.scheduled_end) {
				form.endType = 'on';
				form.endOn = toInputValue(j.scheduled_end).split('T')[0];
			}
		}
	}

	// Init form when job first loads; re-init on job-id navigation
	let loadedJobId = $state<string | null>(null);
	$effect(() => {
		const j = job;
		if (!j || j.id === loadedJobId) return;
		resetFormFromJob(j);
		loadedJobId = j.id;
	});

	// One "this job changed on the server" signal. Every mutation path (schedule/pricing/billing
	// save, status transition, recurrence rebuild) bumps it; the Upcoming appointments list
	// re-fetches off it, so the page and its derived visits stay in lockstep instead of going stale.
	let jobVersion = $state(0);

	// ── Inline field editing (Session 1) ─────────────────────────────────────────
	// Simple fields are click-to-edit in place (Jobber pattern), coordinated by ONE
	// page-level controller so a single Save/Cancel bar (in the header) serves whichever
	// field is open. Multi-field units (schedule, pricing, billing) each have their own
	// focused Edit → Save/Cancel below. After any save we re-seed `form` from the fresh job
	// so every editor stays in sync. Only one editor is open at a time (`anySectionEditing`).
	const editCtl = new InlineEditController();
	let titleDraft = $state('');
	let jobCategoryDraft = $state('');
	let tagsDraft = $state<string[]>([]);
	let assigneeDraft = $state('');
	let scopeDraft = $state('');
	let notesDraft = $state('');

	function rowCtl(key: string, seed: () => void, saveFn: () => Promise<string | null>) {
		return {
			editing: editCtl.isEditing(key),
			onRequestEdit: () => {
				if (canInlineEdit && !sectionEditing) editCtl.begin(key, seed, saveFn);
			},
			onCommit: () => editCtl.commit(),
			onCancel: () => editCtl.cancel()
		};
	}

	// One-field PATCH. Merges the fresh job back into both stores, re-seeds the global
	// edit form, and returns an error string (keeps the row open) or null (success).
	async function patchJobField(
		payload: Record<string, unknown>,
		extra: Partial<JobDetail> = {}
	): Promise<string | null> {
		if (!job) return 'Job not loaded.';
		try {
			const res = await fetch(`/api/jobs/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) return body.error ?? 'Could not save.';
			const merged: JobDetail = { ...job, ...body.job, ...extra };
			jobDetailStore.set(id, merged);
			jobsStore.update({
				id: merged.id,
				title: merged.title,
				status: merged.status,
				assigned_to: merged.assigned_to,
				assignee_name: merged.assignee_name,
				scheduled_start: merged.scheduled_start,
				scheduled_end: merged.scheduled_end
			});
			resetFormFromJob(merged);
			toast.success('Saved');
			return null;
		} catch {
			return 'Network error. Try again.';
		}
	}

	function enterTitleEdit() {
		if (!job || !canInlineEdit) return;
		editCtl.begin(
			'title',
			() => (titleDraft = job?.title ?? ''),
			() => {
				if (!titleDraft.trim()) return Promise.resolve('Job title is required.');
				return patchJobField({ title: titleDraft.trim() });
			}
		);
	}
	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void editCtl.commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			editCtl.cancel();
		}
	}

	// Assignee change also touches the job's live visit + timeline (server side), so
	// nudge jobVersion to refresh the derived visit / activity views.
	async function saveAssignee(): Promise<string | null> {
		const val = assigneeDraft || null;
		const name = val ? (form.assignees.find((a) => a.id === val)?.full_name ?? null) : null;
		const err = await patchJobField({ assigned_to: val }, { assignee_name: name });
		if (!err) jobVersion++;
		return err;
	}

	// Scheduling/completing a visit from JobVisitsSection re-pins the job's own
	// scheduled_start on the server (the visit IS the one-off job's schedule). The PATCH
	// echoes the fresh schedule signals back, so we mirror them into the detail + list
	// caches locally — no full /api/jobs/:id reload (the ~13-query endpoint). Falls back
	// to a forced reload only when no echo is supplied. jobVersion++ still refreshes the
	// visits list + timeline themselves.
	async function reloadJobAfterVisitChange(echo?: AppointmentStatusJobEcho | null) {
		jobVersion++;
		if (echo) {
			jobDetailStore.patch(id, (prev) => ({
				...prev,
				next_open_visit_start: echo.next_open_visit_start,
				has_open_visits: echo.has_open_visits,
				...(echo.repinned
					? { scheduled_start: echo.scheduled_start, scheduled_end: echo.scheduled_end }
					: {})
			}));
			jobsStore.update({
				id,
				next_open_visit_start: echo.next_open_visit_start,
				has_open_visits: echo.has_open_visits,
				...(echo.repinned
					? { scheduled_start: echo.scheduled_start, scheduled_end: echo.scheduled_end }
					: {})
			});
			// Keep the schedule editor's seed in sync when it isn't open (mirrors the
			// resetFormFromJob path the full reload used to take).
			if (!anySectionEditing && echo.repinned) {
				form.scheduledStart = toInputValue(echo.scheduled_start);
				form.scheduledEnd = toInputValue(echo.scheduled_end);
				form.scheduleLater = !echo.scheduled_start;
			}
			return;
		}
		await jobDetailStore.load(id, true);
		const fresh = jobDetailStore.get(id);
		if (!fresh) return;
		jobsStore.update({
			id: fresh.id,
			title: fresh.title,
			status: fresh.status,
			assigned_to: fresh.assigned_to,
			assignee_name: fresh.assignee_name,
			scheduled_start: fresh.scheduled_start,
			scheduled_end: fresh.scheduled_end,
			next_open_visit_start: fresh.next_open_visit_start,
			has_open_visits: fresh.has_open_visits
		});
		if (!anySectionEditing) resetFormFromJob(fresh);
	}

	// ── Schedule inline editor (Session 2.1) ─────────────────────────────────────
	// The schedule/recurrence card edits as a focused unit (Jobber pattern). It reuses the
	// shared `form` (already seeded from the job) and carries the reschedule-notify +
	// recurrence-rebuild logic that used to live in the whole-page save.
	let scheduleEditing = $state(false);
	let scheduleSaving = $state(false);
	let scheduleError = $state<string | null>(null);
	let scheduleSnapshot = $state('');

	// Only the schedule editor mutates `form` while it's open, so any diff on the shared
	// snapshot means the schedule changed.
	const scheduleDirty = $derived(scheduleEditing && form.snapshot() !== scheduleSnapshot);

	function startScheduleEdit() {
		if (!job || !canInlineEdit || anySectionEditing) return;
		resetFormFromJob(job); // ensure form matches the saved job before editing
		scheduleSnapshot = form.snapshot();
		scheduleError = null;
		scheduleEditing = true;
	}

	function cancelSchedule() {
		if (job) resetFormFromJob(job);
		scheduleEditing = false;
		scheduleError = null;
	}

	function failSchedule(msg: string): void {
		scheduleError = msg;
		toast.error(msg);
	}

	async function saveSchedule() {
		if (!job) return;
		const asNeeded = form.scheduleAsNeeded;
		const wasAsNeeded = job.schedule_as_needed;
		const recurringMode = form.jobMode === 'recurring';
		// The RULE — not the toggle — decides how this job is scheduled and saved. A one-off may
		// carry a repeat rule, in which case its start date is a series anchor and its visits are
		// generated, exactly like a recurring job's. (buildRecurrence returns null for as-needed.)
		const nextRecurrence = form.buildRecurrence();
		const seriesMode = !!nextRecurrence;

		// Schedule validation only — billing validation stays with the billing section.
		// A recurring job must repeat somehow: either a rule or "as needed".
		if (recurringMode && !asNeeded && !form.recurConfigured)
			return failSchedule('Set up the repeat rule first.');
		// Anything with a rule needs an anchor + end condition. "As needed" has no rule but still
		// requires the job window (start + end boundary).
		if (seriesMode || asNeeded) {
			if (!form.scheduledStart) return failSchedule('Pick a start date for the schedule.');
			if (form.endType === 'on' && !form.endOn) return failSchedule('Set an end date.');
			if (
				form.endType === 'after' &&
				(!Number(form.endAfterCount) || Number(form.endAfterCount) < 1)
			)
				return failSchedule('Set how long the schedule runs.');
			if (seriesMode && form.preview && form.preview.count === 0)
				return failSchedule('This schedule produces no visits. Adjust the rule.');
		}

		// Confirm before rebuilding visits — only when the rule/anchor actually changed.
		const recurrenceChanged = JSON.stringify(nextRecurrence ?? null) !== originalRecurrenceJSON;
		const wasRecurring = originalRecurrenceJSON !== 'null';
		// Switching a job that HAS visits to "As needed" clears them, so confirm that too.
		const switchingToAsNeeded = asNeeded && !wasAsNeeded;
		if (
			((recurrenceChanged && (wasRecurring || seriesMode)) || switchingToAsNeeded) &&
			!confirm(
				'This updates the upcoming visits on the calendar. Past visits and any already-invoiced visits stay unchanged. Continue?'
			)
		) {
			return;
		}

		// "As needed" stores the job WINDOW (start day + end boundary from Ends after/on) but
		// creates no visits. A date-only start anchors at noon (DST-safe day bucket).
		const newStartISO = asNeeded
			? form.scheduledStart
				? form.scheduledStart.includes('T')
					? new Date(form.scheduledStart).toISOString()
					: new Date(`${form.scheduledStart.split('T')[0]}T12:00:00`).toISOString()
				: null
			: seriesMode
				? form.scheduledStart
					? new Date(form.scheduledStart).toISOString()
					: null
				: !form.scheduleLater && !form.anytime && form.scheduledStart.includes('T')
					? new Date(form.scheduledStart).toISOString()
					: null;
		const newEndISO = asNeeded
			? (form.asNeededEndBoundary()?.toISOString() ?? null)
			: seriesMode
				? !form.anytime && form.scheduledEnd
					? new Date(form.scheduledEnd).toISOString()
					: null
				: !form.scheduleLater && !form.anytime && form.scheduledEnd.includes('T')
					? new Date(form.scheduledEnd).toISOString()
					: null;

		const payload: Record<string, unknown> = {
			scheduled_start: newStartISO,
			scheduled_end: newEndISO,
			// Always send the flag so a job entering OR leaving "As needed" is recorded correctly.
			schedule_as_needed: asNeeded
		};
		if (asNeeded) {
			// "As needed": strip the rule; the server clears the job's live visit so it sits in
			// Action Required with nothing on the calendar. Billing is independent (Jobber) and is
			// saved via the Billing card — schedule changes never touch it.
			payload.recurrence = null;
		} else if (seriesMode) {
			// Any job with a rule — including a one-off — sends it; the server freezes past /
			// invoiced visits and rebuilds the upcoming ones from it.
			payload.recurrence = nextRecurrence;
			payload.visit_instructions = form.visitInstructions.trim() || null;
		} else if (wasRecurring) {
			// The rule was dropped ("Does not repeat"). Clear it; job_type itself is immutable and is
			// never sent. Billing is independent and left untouched.
			payload.recurrence = null;
		}
		// Notify the client only when the start moved to a real new date and a channel is chosen.
		// Never for "As needed" — its start is a window anchor, not a visit the client attends.
		if (
			!asNeeded &&
			newStartISO &&
			newStartISO !== originalStartISO &&
			form.notifyChannel !== 'none'
		) {
			payload.notify_channel = form.notifyChannel;
		}

		scheduleSaving = true;
		scheduleError = null;
		const err = await patchJobField(payload);
		scheduleSaving = false;
		if (err) {
			scheduleError = err;
			toast.error(err);
			return;
		}
		jobVersion++; // visits may have moved — refresh the derived views
		scheduleEditing = false;
	}

	// The shared line-item mapping (same shape the server expects) — used by the pricing save.
	function mappedLineItems() {
		return form.lineItems
			.filter((li) => li.description.trim())
			.map((li, idx) => ({
				line_key: li.line_key ?? null,
				description: li.description.trim(),
				details: li.details?.trim() || null,
				quantity: li.quantity,
				unit: li.unit?.trim() || null,
				section_label: li.section_label?.trim() || null,
				unit_price: li.unit_price,
				unit_cost: li.unit_cost ?? null,
				taxable: li.taxable ?? true,
				source_catalog_item_id: li.source_catalog_item_id ?? null,
				position: idx
			}));
	}

	// ── Pricing inline editor (Session 2.2) ──────────────────────────────────────
	// Line items + discount + tax edit as a focused unit. It deliberately does NOT touch the
	// payment schedule: the server rejects a schedule that bills more than the total, which
	// would block a legitimate price cut. Instead we save the price and — matching Jobber /
	// Housecall Pro — warn afterward if the (untouched) deposits now exceed the new total,
	// to be fixed in the Billing card.
	let pricingEditing = $state(false);
	let pricingSaving = $state(false);
	let pricingError = $state<string | null>(null);
	let pricingSnapshot = $state('');
	const pricingDirty = $derived(pricingEditing && form.snapshot() !== pricingSnapshot);

	function startPricingEdit() {
		if (!job || !canInlineEdit || anySectionEditing) return;
		resetFormFromJob(job);
		pricingSnapshot = form.snapshot();
		pricingError = null;
		pricingEditing = true;
	}

	function cancelPricing() {
		if (job) resetFormFromJob(job);
		pricingEditing = false;
		pricingError = null;
	}

	async function savePricing() {
		if (!job) return;
		const taxRate = Number(form.taxRatePct) > 0 ? Number(form.taxRatePct) / 100 : 0;
		const payload: Record<string, unknown> = {
			tax_rate: taxRate,
			discount_type: form.discountType,
			line_items: mappedLineItems()
		};
		if (form.discountType !== 'none') {
			payload.discount_value = Number(form.discountValue) || 0;
			payload.discount_label = form.discountLabel.trim() || null;
		}

		pricingSaving = true;
		pricingError = null;
		const err = await patchJobField(payload);
		pricingSaving = false;
		if (err) {
			pricingError = err;
			toast.error(err);
			return;
		}
		pricingEditing = false;
		// Warn (don't block): the untouched deposit schedule may now bill more than the new total.
		// `form` was re-seeded from the saved job, so `paymentOverAllocated` reflects the new state.
		if (form.splitEnabled && form.paymentOverAllocated) {
			toast.error(
				'Heads up: the payment schedule now bills more than the job total. Adjust it in the Billing card.'
			);
		}
	}

	// ── Billing inline editor (Session 2.3) ──────────────────────────────────────
	// One-off jobs edit the payment schedule (deposits/milestones); recurring jobs edit the
	// recurring-billing config. Over-allocation is a hard block HERE (the user is editing the
	// schedule directly) — unlike the pricing editor, which only warns.
	let billingEditing = $state(false);
	let billingSaving = $state(false);
	let billingError = $state<string | null>(null);
	let billingSnapshot = $state('');
	const billingDirty = $derived(billingEditing && form.snapshot() !== billingSnapshot);

	function startBillingEdit() {
		if (!job || !canInlineEdit || anySectionEditing) return;
		resetFormFromJob(job);
		billingSnapshot = form.snapshot();
		billingError = null;
		billingEditing = true;
	}

	function cancelBilling() {
		if (job) resetFormFromJob(job);
		billingEditing = false;
		billingError = null;
	}

	function failBilling(msg: string): void {
		billingError = msg;
		toast.error(msg);
	}

	async function saveBilling() {
		if (!job) return;
		// The fixed-price payment schedule can never bill more than the job total.
		if (form.billingType === 'fixed' && form.paymentOverAllocated) {
			return failBilling(
				'The payment schedule bills more than the job total. Lower an amount to continue.'
			);
		}

		// Unified billing model (Jobber billingType × billingFrequency) — sent for every job.
		const payload: Record<string, unknown> = {
			billing_type: form.billingType,
			billing_frequency: form.billingFrequency,
			invoice_frequency: form.billingFrequency === 'periodic' ? form.invoiceFrequency : null,
			// Jobber "Invoice frequency" repeat rule — null unless billing is periodic.
			invoice_recurrence: form.buildInvoiceRecurrence()
		};
		// Payment schedule only applies to fixed-price jobs. An empty array clears the (non-invoiced)
		// schedule; locked (invoiced) rows are sent with their key so the server keeps them.
		payload.payment_milestones =
			form.billingType === 'fixed' && form.splitEnabled
				? form.billingMilestones
						.filter((m) => m.locked || (m.description.trim() && Number(m.amount_value) > 0))
						.map((m) => ({
							key: m.key ?? null,
							description: m.description.trim(),
							amount_type: form.splitBy,
							amount_value: Number(m.amount_value) || 0,
							due_date: m.due_date || null
						}))
				: [];

		billingSaving = true;
		billingError = null;
		const err = await patchJobField(payload);
		billingSaving = false;
		if (err) {
			billingError = err;
			toast.error(err);
			return;
		}
		jobVersion++;
		billingEditing = false;
	}

	// Only one section editor (schedule / pricing) or inline row may be open at once. Billing edits
	// through a MODAL ("Edit invoice settings", Jobber), so it's NOT part of the in-card sectionEditing
	// / floating-header-bar flow — but it still blocks other edits while open (anySectionEditing).
	const sectionEditing = $derived(scheduleEditing || pricingEditing);
	const anySectionEditing = $derived(sectionEditing || editCtl.editing || billingEditing);

	// ── Header edit bar wiring ────────────────────────────────────────────────────
	// The block editors (Schedule / Pricing / Billing) mirror their in-card Save/Cancel up in the
	// page header so the controls stay reachable while scrolled. Only one block is ever open, so
	// these resolve unambiguously to it. Inline single-field edits keep their own editCtl bar.
	const INLINE_LABELS: Record<string, string> = {
		title: 'Title',
		scope: 'Scope of work',
		notes: 'Notes',
		job_category: 'Job category',
		assignee: 'Assigned tech',
		tags: 'Tags'
	};
	const inlineLabel = $derived(
		editCtl.editingKey ? `Editing ${INLINE_LABELS[editCtl.editingKey] ?? 'field'}` : undefined
	);
	const sectionBusy = $derived(scheduleSaving || pricingSaving);
	const sectionDirty = $derived(
		scheduleEditing ? scheduleDirty : pricingEditing ? pricingDirty : true
	);
	const sectionError = $derived(
		scheduleEditing ? scheduleError : pricingEditing ? pricingError : null
	);
	const sectionLabel = $derived(scheduleEditing ? 'Schedule' : pricingEditing ? 'Pricing' : '');
	function saveCurrentSection() {
		if (scheduleEditing) void saveSchedule();
		else if (pricingEditing) void savePricing();
	}
	function cancelCurrentSection() {
		if (scheduleEditing) cancelSchedule();
		else if (pricingEditing) cancelPricing();
	}

	// ── Status transitions ────────────────────────────────────────────────────────
	let actionLoading = $state(false);
	let completeOpen = $state(false);
	let cancelOpen = $state(false);
	let actionError = $state<string | null>(null);

	async function transition(action: 'complete' | 'cancel' | 'reopen') {
		if (!job) return;
		actionLoading = true;
		actionError = null;
		try {
			const res = await fetch(`/api/jobs/${id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action })
			});
			const body = await res.json();
			if (!res.ok) {
				actionError = body.error ?? 'Could not update status.';
				return;
			}
			const merged: JobDetail = { ...job, ...body.job };
			jobDetailStore.set(id, merged);
			jobsStore.update({
				id: merged.id,
				title: merged.title,
				status: merged.status,
				assigned_to: merged.assigned_to,
				assignee_name: merged.assignee_name,
				scheduled_start: merged.scheduled_start,
				scheduled_end: merged.scheduled_end
			});
			resetFormFromJob(merged);
			loadedJobId = merged.id;
			jobVersion++;
		} finally {
			actionLoading = false;
		}
	}

	// ── Confirm dialogs (lazy) ───────────────────────────────────────────────────
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!(completeOpen || cancelOpen) || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	// ── Nav guard ────────────────────────────────────────────────────────────────
	beforeNavigate(({ cancel }) => {
		if (
			(scheduleDirty || pricingDirty || billingDirty) &&
			!scheduleSaving &&
			!pricingSaving &&
			!billingSaving
		) {
			if (!confirm('You have unsaved changes. Leave anyway?')) cancel();
		}
	});

	// Jobber lifecycle: an open (`active`) job can be closed (complete or cancel); a closed
	// (`archived`) job can be reopened. No Start / Hold / Resume — those were the retired manual
	// work states; day-to-day progress now reads from the visits (the derived badge).
	const showComplete = $derived(canEdit && job?.status === 'active');
	const showCancel = $derived(canCancel && job?.status === 'active');
	const showReopen = $derived(canEdit && job?.status === 'archived');
	// "On my way" — a manual customer alert the field tech taps when heading over. Available on any
	// open job to anyone who can send customer messages.
	const showOnMyWay = $derived(
		!anySectionEditing && member().can_send_messages && job?.status === 'active'
	);
	const showActions = $derived(
		!anySectionEditing && (showComplete || showCancel || showOnMyWay || showReopen)
	);
	let onMyWayOpen = $state(false);
</script>

<svelte:head><title>{headerVM?.title ?? 'Job'}</title></svelte:head>

<PageWrapper back="/jobs">
	{#snippet actions()}
		{#if editCtl.editing}
			<!-- The ONE Save/Cancel for whichever inline field is open -->
			<EditActionBar
				onSave={() => void editCtl.commit()}
				onCancel={() => editCtl.cancel()}
				saving={editCtl.saving}
				error={editCtl.error}
				label={inlineLabel}
			/>
		{:else if sectionEditing}
			<!-- Block editor open — mirror its Save/Cancel here so it's reachable while scrolled.
			     Same handlers, save flag, dirty-guard and error as the in-card footer below. -->
			<EditActionBar
				onSave={saveCurrentSection}
				onCancel={cancelCurrentSection}
				saving={sectionBusy}
				canSave={sectionDirty}
				error={sectionError}
				label={`Editing ${sectionLabel}`}
			/>
		{/if}
	{/snippet}

	{#if loadingCold}
		<SkeletonLoader lines={6} height="92px" label="Loading job" />
	{:else if errorMsg && !job}
		<EmptyState title="Couldn't load job" description={errorMsg ?? 'Unknown error.'} />
	{:else if headerVM}
		{@const h = headerVM}

		<!-- Job title + status header -->
		<div class="job-detail-header">
			<div class="job-detail-header__row">
				<div class="job-detail-header__main">
					<p class="job-detail-header__eyebrow">{h.contact_name}</p>
					{#if editCtl.isEditing('title')}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="field__input job-detail-header__title-input"
							bind:value={titleDraft}
							onkeydown={onTitleKeydown}
							placeholder="e.g. Fence repair, Lawn cleanup, HVAC tune-up"
							autofocus
						/>
					{:else}
						<div class="job-detail-header__title-row">
							<h1 class="job-detail-header__title">{h.title}</h1>
							{#if canInlineEdit}
								<EditPencil onclick={enterTitleEdit} ariaLabel="Edit job title" />
							{/if}
						</div>
					{/if}
				</div>
				<JobStatusBadge
					status={h.status}
					scheduledStart={job?.scheduled_start ?? null}
					{hasSeriesAnchor}
					nextOpenVisitStart={job?.next_open_visit_start ?? null}
					hasOpenVisits={job?.has_open_visits}
					completedAt={job?.completed_at ?? null}
					cancelledAt={job?.cancelled_at ?? null}
				/>
			</div>
		</div>

		<!-- Provenance: this job was converted from a Request (Jobber back-link). -->
		{#if job?.request_id}
			<div class="job-detail__backlink">
				<RequestBacklink requestId={job.request_id} />
			</div>
		{/if}

		<!-- Two-column layout -->
		<div class="job-layout">
			<!-- ── LEFT COLUMN ─────────────────────────────────────────────────── -->
			<div class="job-layout__main">
				<!-- Schedule (Session 3.3 merge) — one section: the "Edit all visits" button opens
				     the job-level schedule editor (recurrence-aware, self-contained Edit → Save/Cancel,
				     independent of the global edit flip that still owns pricing/billing); otherwise the
				     per-visit list IS the schedule (To be scheduled / Upcoming / Past). The old
				     Start/End/Assigned summary card was retired — the visit rows already carry it. -->
				{#if scheduleEditing}
					<JobScheduleEditor
						{form}
						jobTypeLocked
						notifyVisible={!!form.scheduledStart &&
							toInputValue(originalStartISO) !== form.scheduledStart}
						notifyLabel="Notify client of new time"
						contactHasPhone={!!job?.contact_phone}
						contactHasEmail={!!job?.contact_email}
						showRebuildNote
					>
						{#snippet footer()}
							<EditActionBar
								onSave={() => void saveSchedule()}
								onCancel={cancelSchedule}
								saving={scheduleSaving}
								canSave={scheduleDirty}
								error={scheduleError}
								saveLabel="Save schedule"
								variant="card"
							/>
						{/snippet}
					</JobScheduleEditor>
				{:else if job && visitJobInfo}
					<JobVisitsSection
						jobId={job.id}
						jobInfo={visitJobInfo}
						canManage={canEdit}
						reloadKey={jobVersion}
						recurrence={job.recurrence}
						appointmentCount={job.appointment_count}
						scheduledStart={job.scheduled_start}
						scheduledEnd={job.scheduled_end}
						scheduleAsNeeded={job.schedule_as_needed}
						onEditAll={canInlineEdit && !anySectionEditing ? startScheduleEdit : undefined}
						onChanged={reloadJobAfterVisitChange}
					/>
				{:else}
					<SkeletonLoader lines={3} height="64px" />
				{/if}

				<!-- Line items & pricing — focused editor (its own Edit → Save/Cancel) -->
				{#if pricingEditing}
					<JobProductsPricing {form}>
						{#snippet footer()}
							<EditActionBar
								onSave={() => void savePricing()}
								onCancel={cancelPricing}
								saving={pricingSaving}
								canSave={pricingDirty}
								error={pricingError}
								saveLabel="Save pricing"
								variant="card"
							/>
						{/snippet}
					</JobProductsPricing>
				{:else if job}
					<JobLineItemsSection
						{job}
						{canInvoice}
						onEdit={canInlineEdit && !anySectionEditing ? startPricingEdit : undefined}
					/>
				{/if}

				<!-- Tasks / checklist (Session 3) — the crew's to-do list, ticked off in the field.
				     View-only: has its own inline add, like time tracking / costing. -->
				{#if job}
					<JobTasksSection jobId={job.id} tasks={job.tasks} canManage={canEdit} />
				{/if}

				<!-- Job forms (Session 4.2) — inspection/checklist forms attached to the job and
				     filled in the field. View-only: has its own inline picker + fill, like tasks. -->
				{#if job}
					<JobFormsSection jobId={job.id} submissions={job.form_submissions} canManage={canEdit} />
				{/if}

				<!-- Custom fields (Session 7) — org-defined extra fields shown on every job.
				     View-only: renders only when the org has defined at least one field. -->
				{#if job}
					<JobCustomFieldsSection
						jobId={job.id}
						customFields={job.custom_fields}
						canManage={canEdit}
					/>
				{/if}

				<!-- Time tracking (Session 2) — clock in/out per job; hours + labor cost feed Job
				     Costing below. View-only: lives outside the edit form like costing/expenses. -->
				{#if job}
					<JobTimeTrackingSection
						jobId={job.id}
						entries={job.time_entries}
						canManage={canEdit}
						canViewCost={!!job.costing}
					/>
				{/if}

				<!-- Job costing (Session 1) — revenue vs cost, profit & margin, expense tracking.
				     View-only: cost data + the expense form live here, not in the job edit form.
				     Renders only when the server sent costing (i.e. the viewer can see revenue). -->
				{#if job && job.costing}
					<JobCostingSection
						jobId={job.id}
						expenses={job.expenses}
						costing={job.costing}
						canManage={canEdit}
					/>
				{/if}

				<!-- Billing — one unified model for every job (Jobber billingType × billingFrequency).
				     The read view is the Jobber tabbed card (Invoicing | Reminders); settings edit
				     through the "Edit invoice settings" modal below. Over-allocation of the fixed-price
				     schedule is a hard block on save. -->
				{#if job}
					<JobBillingSection
						{job}
						{canInvoice}
						onEdit={canInlineEdit && !anySectionEditing ? startBillingEdit : undefined}
						onInvoiced={() => void jobDetailStore.load(id, true)}
					/>
					<JobBillingSettingsDialog
						open={billingEditing}
						{form}
						saving={billingSaving}
						error={billingError}
						onsave={() => void saveBilling()}
						oncancel={cancelBilling}
					/>
				{/if}

				<!-- Scope of work + Notes -->
				{#if job}
					<div class="job-inline-card">
						<div class="job-inline-card__head">
							<span class="job-eyebrow">Scope &amp; Notes</span>
						</div>
						<div class="job-inline-card__rows">
							<InlineEditRow
								label="Scope of work"
								canEdit={canInlineEdit}
								{...rowCtl(
									'scope',
									() => (scopeDraft = job?.scope_of_work ?? ''),
									() => patchJobField({ scope_of_work: scopeDraft.trim() || null })
								)}
							>
								{#snippet display()}
									{#if job?.scope_of_work}
										<p class="job-inline-text">{job.scope_of_work}</p>
									{:else}
										<span class="job-inline-muted">Add scope of work</span>
									{/if}
								{/snippet}
								{#snippet editor()}
									<!-- svelte-ignore a11y_autofocus -->
									<textarea
										class="field__input job-inline-area"
										rows="4"
										bind:value={scopeDraft}
										placeholder="What work will be done?"
										autofocus
									></textarea>
								{/snippet}
							</InlineEditRow>

							<InlineEditRow
								label="Internal notes"
								canEdit={canInlineEdit}
								{...rowCtl(
									'notes',
									() => (notesDraft = job?.notes ?? ''),
									() => patchJobField({ notes: notesDraft.trim() || null })
								)}
							>
								{#snippet display()}
									{#if job?.notes}
										<p class="job-inline-text">{job.notes}</p>
									{:else}
										<span class="job-inline-muted">Add internal notes</span>
									{/if}
								{/snippet}
								{#snippet editor()}
									<!-- svelte-ignore a11y_autofocus -->
									<textarea
										class="field__input job-inline-area"
										rows="4"
										bind:value={notesDraft}
										placeholder="Notes visible only to your team"
										autofocus
									></textarea>
								{/snippet}
							</InlineEditRow>
						</div>
					</div>
				{/if}

				{#if job}
					<!-- Client sign-off (Session 6): customer approves the completed work; capturable anytime -->
					<JobSignoffSection jobId={job.id} signoff={job.signoff} canManage={canEdit} />
				{/if}

				<!-- Photos & attachments (always visible) -->
				{#if job}
					<MediaGallery
						jobId={job.id}
						canUpload={member().can_upload_files}
						canDelete={member().can_upload_files}
						contactId={job.contact_id}
						contactName={job.contact_name}
						canSendMessages={member().can_send_messages}
					/>
				{/if}
			</div>

			<!-- ── RIGHT SIDEBAR ───────────────────────────────────────────────── -->
			<div class="job-layout__sidebar">
				<!-- Client card (always visible) -->
				{#if job}
					<JobClientCard
						contact_id={job.contact_id}
						contact_name={job.contact_name}
						contact_phone={job.contact_phone}
						contact_email={job.contact_email}
						service_address_line_1={job.service_address_line_1}
						service_address_line_2={job.service_address_line_2}
						service_address_city={job.service_address_city}
						service_address_state={job.service_address_state}
						service_address_zip={job.service_address_zip}
					/>
				{:else}
					<div class="job-section">
						<SkeletonLoader lines={3} />
					</div>
				{/if}

				<!-- Service address is owned by the client's contact record (Jobber/Housecall pattern):
				     it shows read-only in the Client card above. Edit it on the contact, not here. -->

				<!-- Status + actions (view mode only, non-terminal) -->
				{#if job}
					<div class="job-status-card">
						<div class="job-status-card__header">
							<span class="job-eyebrow">Status</span>
							<JobStatusBadge
								status={job.status}
								scheduledStart={job.scheduled_start}
								{hasSeriesAnchor}
								nextOpenVisitStart={job.next_open_visit_start}
								hasOpenVisits={job.has_open_visits}
								completedAt={job.completed_at}
								cancelledAt={job.cancelled_at}
							/>
						</div>

						{#if job.review_request_status !== undefined}
							<div class="job-status-card__review">
								<span class="job-status-card__review-label">Review request</span>
								<JobReviewIndicator
									jobId={job.id}
									jobStatus={job.status}
									completedAt={job.completed_at}
									status={job.review_request_status}
									onSent={(next) => {
										jobDetailStore.patch(id, (prev) => ({
											...prev,
											review_request_status: next
										}));
									}}
								/>
							</div>
						{/if}

						{#if actionError}
							<p class="job-status-card__error">{actionError}</p>
						{/if}

						{#if showActions}
							<div class="job-status-card__actions">
								{#if showOnMyWay}
									<Button variant="outline" class="btn--full" onclick={() => (onMyWayOpen = true)}>
										On my way
										{#snippet icon()}<i class="ri-truck-line" aria-hidden="true"></i>{/snippet}
									</Button>
								{/if}
								{#if showReopen}
									<Button
										class="btn--full"
										loadingLabel="Reopening…"
										successLabel="Reopened"
										loading={actionLoading}
										onclick={() => void transition('reopen')}
									>
										Reopen job
										{#snippet icon()}<i class="ri-play-circle-line" aria-hidden="true"
											></i>{/snippet}
									</Button>
								{/if}
								{#if showComplete}
									<Button
										variant="outline"
										class="btn--full"
										loadingLabel="Saving…"
										successLabel="Complete"
										loading={actionLoading}
										onclick={() => (completeOpen = true)}
									>
										Mark complete
										{#snippet icon()}<i class="ri-checkbox-circle-line" aria-hidden="true"
											></i>{/snippet}
									</Button>
								{/if}
								{#if showCancel}
									<Button
										variant="danger-outline"
										class="btn--full"
										loadingLabel="Cancelling…"
										successLabel="Cancelled"
										loading={actionLoading}
										onclick={() => (cancelOpen = true)}
									>
										Cancel job
										{#snippet icon()}<i class="ri-close-circle-line" aria-hidden="true"
											></i>{/snippet}
									</Button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Job info (type, category, tags, assignee) — inline click-to-edit -->
				{#if job}
					<div class="job-inline-card">
						<div class="job-inline-card__head"><span class="job-eyebrow">Job Info</span></div>
						<div class="job-inline-card__rows">
							<!-- Job type: read-only by design. Jobber does not allow switching a job
							     between one-off and recurring after creation — the copy explains the
							     way out rather than hiding the rule behind a disabled control. -->
							<InlineEditRow label="Job type" hint="Can’t be changed — duplicate the job to switch">
								{#snippet display()}
									{isRecurring ? 'Recurring' : 'One-off'}
								{/snippet}
							</InlineEditRow>

							<!-- Job category -->
							<InlineEditRow
								label="Job category"
								canEdit={canInlineEdit}
								{...rowCtl(
									'job_category',
									() => (jobCategoryDraft = job?.job_category ?? ''),
									() => patchJobField({ job_category: jobCategoryDraft.trim() || null })
								)}
							>
								{#snippet display()}
									{#if job?.job_category}
										{job.job_category}
									{:else}
										<span class="job-inline-muted">Add job category</span>
									{/if}
								{/snippet}
								{#snippet editor()}
									<JobCategoryPicker bind:value={jobCategoryDraft} autofocus />
								{/snippet}
							</InlineEditRow>

							<!-- Assigned technician (managers only) -->
							{#if canFullPipeline}
								<InlineEditRow
									label="Assigned tech"
									canEdit={canInlineEdit}
									{...rowCtl(
										'assignee',
										() => (assigneeDraft = job?.assigned_to ?? ''),
										saveAssignee
									)}
								>
									{#snippet display()}
										{#if job?.assignee_name}
											{job.assignee_name}
										{:else}
											<span class="job-inline-muted">Unassigned</span>
										{/if}
									{/snippet}
									{#snippet editor()}
										<select class="field__select" bind:value={assigneeDraft}>
											<option value="">Unassigned</option>
											{#each form.assignees as a (a.id)}
												<option value={a.id}>{a.full_name}</option>
											{/each}
										</select>
									{/snippet}
								</InlineEditRow>
							{/if}

							<!-- Tags -->
							<InlineEditRow
								label="Tags"
								canEdit={canInlineEdit}
								{...rowCtl(
									'tags',
									() => (tagsDraft = [...(job?.tags ?? [])]),
									() => patchJobField({ tags: tagsDraft })
								)}
							>
								{#snippet display()}
									{#if job?.tags?.length}
										<div class="job-inline-tags">
											{#each job.tags as tag (tag)}
												<span class="badge">{tag}</span>
											{/each}
										</div>
									{:else}
										<span class="job-inline-muted">Add tags</span>
									{/if}
								{/snippet}
								{#snippet editor()}
									<JobTagsEditor bind:value={tagsDraft} />
								{/snippet}
							</InlineEditRow>
						</div>
					</div>
				{/if}

				<!-- Related links (view mode only) -->
				{#if job}
					<JobLinksSection
						job_id={job.id}
						contact_id={job.contact_id}
						contact_name={job.contact_name}
						job_title={job.title}
						opportunity_id={job.opportunity_id}
						has_line_items={job.line_items.length > 0}
						invoice_count={job.invoice_count}
						appointment_count={job.appointment_count}
					/>
				{/if}
			</div>
		</div>

		<!-- Confirm dialogs -->
		{#if job && ConfirmDialog}
			<ConfirmDialog
				bind:open={completeOpen}
				title="Mark job complete?"
				description="The job will be closed as complete. You can reopen it later if needed."
				confirmLabel="Mark complete"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('complete');
				}}
			/>
			<ConfirmDialog
				bind:open={cancelOpen}
				title="Cancel this job?"
				description="The job will be closed as cancelled. You can reopen it later if needed."
				confirmLabel="Cancel job"
				variant="destructive"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('cancel');
				}}
			/>
		{/if}
		{#if job}
			<OnMyWayDialog bind:open={onMyWayOpen} jobId={job.id} />
		{/if}
	{:else}
		<EmptyState title="Couldn't load job" description={errorMsg ?? 'Unknown error.'} />
	{/if}
</PageWrapper>

<RecurringScheduleModal
	bind:open={form.recurModalOpen}
	value={form.recurShape}
	onsave={form.onRecurSaved}
/>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	/* Provenance back-link banner sits between the header and the two-column layout. */
	.job-detail__backlink {
		margin-bottom: $space-4;
	}

	/* Block + inline Save/Cancel render via the shared EditActionBar
	   (components/_edit-action-bar.scss) in both the header and card footers. */

	/* Card shell for a group of inline rows. Row padding comes from InlineEditRow,
	   so the head is padded to align with it and the rows sit flush to the edges. */
	.job-inline-card {
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-sm);
		overflow: hidden;

		&__head {
			padding: $space-4 $space-4 $space-3;
		}

		&__rows {
			border-top: 1px solid var(--color-border);
		}
	}

	.job-inline-muted {
		color: var(--color-text-muted);
	}

	.job-inline-text {
		margin: 0;
		white-space: pre-wrap;
		font-size: $fs-body;
		color: var(--color-text-primary);
	}

	.job-inline-area {
		width: 100%;
		resize: vertical;
	}

	.job-inline-tags {
		display: flex;
		flex-wrap: wrap;
		gap: $space-1;
	}

	/* Inline title edit in the header */
	.job-detail-header__title-row {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.job-detail-header__title-input {
		width: 100%;
	}
</style>
