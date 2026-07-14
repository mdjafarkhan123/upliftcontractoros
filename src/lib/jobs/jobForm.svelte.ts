// Shared reactive state model for the job form. Both the "New Job" page (/jobs/new) and the
// job detail edit mode (/jobs/[id]) instantiate one of these so the two screens share a single
// source of truth — identical fields, identical live totals, identical recurrence helpers. This
// is the foundation of the create/edit unification (matches Jobber's single job form).
//
// It owns ONLY the fields the two screens have in common. Page-specific concerns stay in the
// pages: create keeps the contact search/prefill + POST; edit keeps view-mode, status actions,
// dirty-change guard, notify-on-reschedule, recurrence-rebuild confirm + PATCH.
//
// No $bindable is needed when this is passed to a component — methods mutate the instance's own
// $state fields, so reactivity flows through the shared reference.

import type { QuoteLineDraft } from '$lib/types/quotes';
import type { JobRecurrence, EndUnit } from '$lib/jobs/recurrence';
import { summarizeRecurrence, shortRepeatLabel } from '$lib/jobs/recurrence';
import { milestoneAmount, type BillingType, type InvoiceFrequency } from '$lib/jobs/billing';
import type { RecurrenceShape } from '$lib/components/jobs/RecurringScheduleModal.svelte';
import type { MilestoneDraft } from '$lib/components/jobs/JobBillingEditor.svelte';

export type NotifyChannel = 'sms' | 'email' | 'both' | 'none';
export type NotifyTemplate = { sms: string; subject: string; body: string; enabled: boolean };
export type JobMode = 'one_off' | 'recurring';
export type DiscountType = 'none' | 'fixed' | 'percent';
export type JobAssignee = { id: string; full_name: string };
export type RecurrencePreview = { count: number; first: string | null; last: string | null };

function emptyRecurShape(): RecurrenceShape {
	return {
		freq: 'week',
		interval: 1,
		weekdays: [],
		month_mode: 'day_of_month',
		month_days: [],
		month_last_day: false,
		month_weeks: [],
		month_weekdays: []
	};
}

// Pick the smartest notify default the moment a contact is chosen: SMS + Email when we have
// both, otherwise whichever single channel we can reach them on; 'none' when neither.
export function defaultNotifyChannel(hasPhone: boolean, hasEmail: boolean): NotifyChannel {
	if (hasPhone && hasEmail) return 'both';
	if (hasEmail) return 'email';
	if (hasPhone) return 'sms';
	return 'none';
}

export class JobFormState {
	// ── Basics ──────────────────────────────────────────────────────────────────
	title = $state('');
	jobType = $state('');
	tags = $state<string[]>([]);
	scopeOfWork = $state('');
	notes = $state('');
	// Create-only (the detail page drives status via dedicated transition actions), but harmless
	// to carry here so both screens read the same model shape.
	status = $state<'scheduled' | 'in_progress' | 'completed'>('scheduled');

	// ── Schedule ────────────────────────────────────────────────────────────────
	// Jobber "Schedule later" (unchecked by default): a one-off job is scheduled by
	// default (date auto-fills to today on the create page). Ticking this leaves the
	// job undated — the server creates a single UNSCHEDULED placeholder visit instead
	// of a dated calendar visit. Meaningless for recurring jobs (always dated).
	scheduleLater = $state(false);
	anytime = $state(false);
	scheduledStart = $state('');
	scheduledEnd = $state('');

	// ── Recurring schedule ───────────────────────────────────────────────────────
	jobMode = $state<JobMode>('one_off');
	recurModalOpen = $state(false);
	// Whether the contractor has saved a repeat rule yet (vs the empty default shape).
	recurConfigured = $state(false);
	recurShape = $state<RecurrenceShape>(emptyRecurShape());
	endType = $state<'after' | 'on'>('after');
	endAfterCount = $state('6');
	endAfterUnit = $state<EndUnit>('months');
	endOn = $state('');
	visitInstructions = $state('');

	// ── Recurrence live preview (exact visit count from the server) ───────────────
	preview = $state<RecurrencePreview | null>(null);
	previewLoading = $state(false);
	previewError = $state('');

	// ── Service address ───────────────────────────────────────────────────────────
	addrLine1 = $state('');
	addrLine2 = $state('');
	addrCity = $state('');
	addrState = $state('');
	addrZip = $state('');

	// ── Line items & pricing ───────────────────────────────────────────────────────
	lineItems = $state<QuoteLineDraft[]>([]);
	discountType = $state<DiscountType>('none');
	discountValue = $state('');
	discountLabel = $state('');
	taxRatePct = $state('');

	// ── Billing (one-off): close reminder + payment schedule ──────────────────────
	invoiceOnClose = $state(false);
	splitEnabled = $state(false);
	splitBy = $state<'percent' | 'fixed'>('percent');
	billingMilestones = $state<MilestoneDraft[]>([]);

	// ── Billing (recurring): how a recurring job is invoiced ──────────────────────
	recurBillingEnabled = $state(false);
	recurBillingType = $state<BillingType>('visit_based');
	invoiceFrequency = $state<InvoiceFrequency>('per_visit');
	fixedInvoiceAmount = $state('');

	// ── Assignment & client notification ──────────────────────────────────────────
	assignees = $state<JobAssignee[]>([]);
	assignedToId = $state('');
	notifyAssignee = $state(false);
	notifyChannel = $state<NotifyChannel>('none');

	// ── Client notification message (preview + per-job override) ───────────────────
	// The org-level "job scheduled" confirmation template, loaded once so the form can
	// show the client exactly what they'll receive. `notifyEditing` opens a per-job
	// override box seeded from the template; the override rides along in the job.scheduled
	// outbox payload and is used only for this job (settings stay the single default).
	notifyTemplate = $state<NotifyTemplate | null>(null);
	notifyTemplateLoading = $state(false);
	notifyEditing = $state(false);
	notifySmsOverride = $state('');
	notifySubjectOverride = $state('');
	notifyBodyOverride = $state('');

	// ── Derived: pricing (same formulas the server's recalcJobTotals uses) ─────────
	scopeCharsLeft = $derived(10000 - this.scopeOfWork.length);

	subtotal = $derived.by(() =>
		this.lineItems.reduce((sum, li) => {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return sum;
			return sum + Math.round(q * p * 100) / 100;
		}, 0)
	);

	// Sum of only the taxable lines (li.taxable defaults to true when unset). Mirrors the
	// `taxable_subtotal` FILTER in recalcJobTotals so the on-screen tax matches the saved tax.
	taxableSubtotal = $derived.by(() =>
		this.lineItems.reduce((sum, li) => {
			if (li.taxable === false) return sum;
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return sum;
			return sum + Math.round(q * p * 100) / 100;
		}, 0)
	);

	discountAmount = $derived.by(() => {
		if (this.discountType === 'none') return 0;
		const v = Number(this.discountValue);
		if (!Number.isFinite(v) || v <= 0) return 0;
		if (this.discountType === 'percent')
			return Math.round(((this.subtotal * Math.min(v, 100)) / 100) * 100) / 100;
		return Math.min(Math.max(v, 0), this.subtotal);
	});

	taxRate = $derived(Number(this.taxRatePct) > 0 ? Number(this.taxRatePct) / 100 : 0);
	discountedBase = $derived(
		Math.max(0, Math.round((this.subtotal - this.discountAmount) * 100) / 100)
	);
	// Tax the taxable SHARE of the discounted amount — proportional discount allocation, identical
	// to recalcJobTotals / recalcInvoiceTotals. Collapses to discountedBase * taxRate when every
	// line is taxable.
	taxAmount = $derived(
		this.subtotal > 0
			? Math.round(
					((this.taxableSubtotal * (this.subtotal - this.discountAmount)) / this.subtotal) *
						this.taxRate *
						100
				) / 100
			: 0
	);
	total = $derived(Math.round((this.discountedBase + this.taxAmount) * 100) / 100);

	// ── Derived: payment-schedule allocation (one-off billing) ─────────────────────
	// Live dollar value the payment schedule covers (each row's % share of the total, or its
	// flat amount — same math as the server), and whether it bills MORE than the job total.
	// The pages use `paymentOverAllocated` to block save; the editor shows the live warning.
	paymentAllocated = $derived.by(() =>
		this.billingMilestones.reduce(
			(sum, m) => sum + milestoneAmount(this.splitBy, Number(m.amount_value), this.total),
			0
		)
	);
	paymentOverAllocated = $derived(
		this.jobMode === 'one_off' &&
			this.splitEnabled &&
			Math.round((this.paymentAllocated - this.total) * 100) / 100 > 0.01
	);

	// ── Derived: schedule helpers ──────────────────────────────────────────────────
	estimatedDuration = $derived.by(() => {
		if (!this.scheduledStart || !this.scheduledEnd || this.anytime) return null;
		const start = new Date(this.scheduledStart);
		const end = new Date(this.scheduledEnd);
		const diffMs = end.getTime() - start.getTime();
		if (diffMs <= 0) return null;
		const totalMins = Math.round(diffMs / 60000);
		const hrs = Math.floor(totalMins / 60);
		const mins = totalMins % 60;
		if (hrs === 0) return `Est. ${mins} min`;
		if (mins === 0) return `Est. ${hrs} hr${hrs > 1 ? 's' : ''}`;
		return `Est. ${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min`;
	});

	mapsUrl = $derived.by(() => {
		const parts = [this.addrLine1, this.addrCity, this.addrState, this.addrZip]
			.filter(Boolean)
			.join(', ');
		if (!parts) return null;
		return `https://maps.google.com/?q=${encodeURIComponent(parts)}`;
	});

	// ── Derived: recurrence labels ──────────────────────────────────────────────────
	repeatLabel = $derived(
		this.recurConfigured
			? summarizeRecurrence({ ...this.recurShape, end_type: this.endType } as JobRecurrence)
			: ''
	);
	repeatShort = $derived(
		this.recurConfigured
			? shortRepeatLabel({ ...this.recurShape, end_type: this.endType } as JobRecurrence)
			: ''
	);

	// ── Helpers ─────────────────────────────────────────────────────────────────────
	// Build the JobRecurrence payload from the modal shape + the page's end condition.
	// Returns null when not in recurring mode or no rule has been saved yet.
	buildRecurrence = (): JobRecurrence | null => {
		if (this.jobMode !== 'recurring' || !this.recurConfigured) return null;
		const r: JobRecurrence = {
			freq: this.recurShape.freq,
			interval: Math.max(1, Math.floor(Number(this.recurShape.interval) || 1)),
			end_type: this.endType,
			anytime: this.anytime
		};
		if (this.recurShape.freq === 'week') {
			r.weekdays = [...this.recurShape.weekdays].sort((a, b) => a - b);
		} else {
			r.month_mode = this.recurShape.month_mode;
			if (this.recurShape.month_mode === 'day_of_month') {
				r.month_days = [...this.recurShape.month_days].sort((a, b) => a - b);
				r.month_last_day = this.recurShape.month_last_day;
			} else {
				r.month_weeks = [...this.recurShape.month_weeks].sort((a, b) => a - b);
				r.month_weekdays = [...this.recurShape.month_weekdays].sort((a, b) => a - b);
			}
		}
		if (this.endType === 'after') {
			r.end_after_count = Math.max(1, Math.floor(Number(this.endAfterCount) || 1));
			r.end_after_unit = this.endAfterUnit;
		} else if (this.endOn) {
			r.end_on = this.endOn;
		}
		return r;
	};

	onRecurSaved = (v: RecurrenceShape) => {
		this.recurShape = v;
		this.recurConfigured = true;
	};

	// Quick-date chip (Today / Tomorrow / …). Changes only the DATE — a time already
	// chosen is kept, and an empty time stays empty (Jobber's "date, time optional"
	// model). Re-anchors the end onto the new date when it carries a time.
	setDateQuick = (offsetDays: number) => {
		const d = new Date();
		d.setDate(d.getDate() + offsetDays);
		const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const startTime = this.scheduledStart.includes('T') ? this.scheduledStart.split('T')[1] : '';
		this.scheduledStart = startTime ? `${dateStr}T${startTime}` : dateStr;
		const endTime = this.scheduledEnd.includes('T') ? this.scheduledEnd.split('T')[1] : '';
		this.scheduledEnd = endTime ? `${dateStr}T${endTime}` : '';
	};

	// Fetch the exact visit count/first/last the server would create for the current rule. The
	// debounced trigger lives in the rendering component (an $effect can't run inside a plain
	// class); this method only performs the fetch and stores the result.
	runPreview = async (startIso: string, rec: JobRecurrence): Promise<void> => {
		this.previewLoading = true;
		this.previewError = '';
		try {
			const res = await fetch('/api/jobs/recurrence-preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					scheduled_start: startIso,
					scheduled_end: this.scheduledEnd ? new Date(this.scheduledEnd).toISOString() : null,
					recurrence: rec
				})
			});
			const body = (await res.json()) as { data?: RecurrencePreview; error?: string };
			if (!res.ok || !body.data) {
				this.preview = null;
				this.previewError = body.error ?? 'Could not preview this schedule.';
				return;
			}
			this.preview = body.data;
		} catch {
			this.preview = null;
			this.previewError = 'Could not preview this schedule.';
		} finally {
			this.previewLoading = false;
		}
	};

	clearPreview = () => {
		this.preview = null;
		this.previewError = '';
	};

	// Load the org's "job scheduled" confirmation template once and seed the override
	// boxes with it, so opening "Edit message" starts from the real default. Best-effort:
	// a failure just leaves the preview/edit UI hidden (the job still sends on the
	// worker's template). Called once from the page's onMount.
	loadNotifyTemplate = async (): Promise<void> => {
		if (this.notifyTemplate || this.notifyTemplateLoading) return;
		this.notifyTemplateLoading = true;
		try {
			const res = await fetch('/api/jobs/notify-template');
			if (!res.ok) return;
			const body = (await res.json()) as {
				data?: {
					enabled: boolean;
					sms_message: string;
					email_subject: string;
					email_message: string;
				};
			};
			if (!body.data) return;
			this.notifyTemplate = {
				sms: body.data.sms_message,
				subject: body.data.email_subject,
				body: body.data.email_message,
				enabled: body.data.enabled
			};
			this.notifySmsOverride = body.data.sms_message;
			this.notifySubjectOverride = body.data.email_subject;
			this.notifyBodyOverride = body.data.email_message;
		} catch {
			// best-effort
		} finally {
			this.notifyTemplateLoading = false;
		}
	};

	// Per-job notification overrides to attach to the create/reschedule payload. Only the
	// channels actually being sent are considered, and a field is sent only when the
	// contractor edited it away from the template default — otherwise null keeps the
	// org template as the single source of truth (mirrors the quote send dialog).
	buildNotifyOverrides = (): {
		sms: string | null;
		subject: string | null;
		body: string | null;
	} => {
		const t = this.notifyTemplate;
		if (!this.notifyEditing || !t) return { sms: null, subject: null, body: null };
		const wantsSms = this.notifyChannel === 'sms' || this.notifyChannel === 'both';
		const wantsEmail = this.notifyChannel === 'email' || this.notifyChannel === 'both';
		return {
			sms:
				wantsSms && this.notifySmsOverride.trim() && this.notifySmsOverride !== t.sms
					? this.notifySmsOverride
					: null,
			subject:
				wantsEmail && this.notifySubjectOverride.trim() && this.notifySubjectOverride !== t.subject
					? this.notifySubjectOverride
					: null,
			body:
				wantsEmail && this.notifyBodyOverride.trim() && this.notifyBodyOverride !== t.body
					? this.notifyBodyOverride
					: null
		};
	};

	// Serialized form of every field the edit page tracks for its unsaved-changes guard. Used by
	// the detail page (Session 2) to detect a real change before enabling Save / warning on nav.
	snapshot = (): string =>
		JSON.stringify({
			title: this.title,
			assignedTo: this.assignedToId,
			scheduleLater: this.scheduleLater,
			scheduledStart: this.scheduledStart,
			scheduledEnd: this.scheduledEnd,
			anytime: this.anytime,
			scopeOfWork: this.scopeOfWork,
			notes: this.notes,
			jobType: this.jobType,
			tags: [...this.tags].sort().join(','),
			lineItems: JSON.stringify($state.snapshot(this.lineItems)),
			discountType: this.discountType,
			discountValue: this.discountValue,
			discountLabel: this.discountLabel,
			taxRatePct: this.taxRatePct,
			invoiceOnClose: this.invoiceOnClose,
			splitEnabled: this.splitEnabled,
			splitBy: this.splitBy,
			billingMilestones: JSON.stringify($state.snapshot(this.billingMilestones)),
			recurBillingEnabled: this.recurBillingEnabled,
			recurBillingType: this.recurBillingType,
			invoiceFrequency: this.invoiceFrequency,
			fixedInvoiceAmount: this.fixedInvoiceAmount,
			jobMode: this.jobMode,
			recurConfigured: this.recurConfigured,
			recurShape: JSON.stringify($state.snapshot(this.recurShape)),
			endType: this.endType,
			endAfterCount: this.endAfterCount,
			endAfterUnit: this.endAfterUnit,
			endOn: this.endOn,
			visitInstructions: this.visitInstructions,
			addrLine1: this.addrLine1,
			addrLine2: this.addrLine2,
			addrCity: this.addrCity,
			addrState: this.addrState,
			addrZip: this.addrZip
		});
}
