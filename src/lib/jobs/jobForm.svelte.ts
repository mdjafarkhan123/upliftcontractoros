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
import type { JobRecurrence, InvoiceRecurrence, EndUnit } from '$lib/jobs/recurrence';
import { summarizeRecurrence, shortRepeatLabel } from '$lib/jobs/recurrence';
import {
	milestoneAmount,
	type BillingType,
	type BillingFrequency,
	type InvoiceFrequency,
	type BillingRepeatMode
} from '$lib/jobs/billing';
import type { RecurrenceShape } from '$lib/components/jobs/RecurringScheduleModal.svelte';
import type { MilestoneDraft } from '$lib/components/jobs/JobBillingEditor.svelte';

export type NotifyChannel = 'sms' | 'email' | 'both' | 'none';
export type NotifyTemplate = { sms: string; subject: string; body: string; enabled: boolean };
export type JobMode = 'one_off' | 'recurring';
// The single inline "Repeats" dropdown value (Jobber / Google-Calendar model). It is DERIVED
// from the underlying schedule state (jobMode + recurShape + scheduleAsNeeded) and written back
// via setRepeatMode. The three preset values (week1/week2/month) are computed off the chosen
// start date's weekday; 'custom_saved' is anything the preset matcher doesn't recognize.
// 'custom' is the ACTION value ("Custom schedule…" — opens the modal) and is never a resting
// state; 'custom_saved' is the injected option that holds a saved custom rule and is what the
// dropdown rests on once one exists.
export type RepeatMode =
	| 'none'
	| 'day'
	| 'week1'
	| 'week2'
	| 'month'
	| 'as_needed'
	| 'custom'
	| 'custom_saved';
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
		month_cells: []
	};
}

// The canned "Monthly on the last day of the month" invoice schedule — Jobber's default periodic
// invoice option (ref/billing/10). A month-mode rule flagged for the last day, nothing else set.
function monthlyLastDayShape(): RecurrenceShape {
	return {
		freq: 'month',
		interval: 1,
		weekdays: [],
		month_mode: 'day_of_month',
		month_days: [],
		month_last_day: true,
		month_cells: []
	};
}

// Whether a shape IS the canned monthly-last-day rule (vs an arbitrary custom periodic rule) — used
// to decide which "Invoice frequency" option the recurring billing rests on.
function isMonthlyLastDay(s: RecurrenceShape): boolean {
	return (
		s.freq === 'month' &&
		s.interval === 1 &&
		s.month_mode === 'day_of_month' &&
		s.month_last_day === true &&
		s.month_days.length === 0
	);
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
	// Free-text work category ("Repair", "Installation") — NOT the one-off/recurring type,
	// which is `jobMode` below and maps to the job_type column.
	jobCategory = $state('');
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
	// Jobber "As Needed — We Won't Prompt You": a recurring job with NO rule and NO visits.
	// Mutually exclusive with a real repeat rule; drives the job into "Action Required".
	scheduleAsNeeded = $state(false);
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

	// ── Billing model (Jobber billingType × billingFrequency) — one model, every job ──
	// billingType = WHAT each invoice contains ('fixed' = the job's line items; 'visit_based' =
	// completed visits). billingFrequency = WHEN to invoice ('never' = not set up). invoiceFrequency
	// = the cadence when billingFrequency='periodic'. The payment schedule (split/milestones) is a
	// fixed-price progress-invoicing option and applies only when billingType='fixed'.
	billingType = $state<BillingType>('fixed');
	billingFrequency = $state<BillingFrequency>('on_completion');
	invoiceFrequency = $state<InvoiceFrequency>('weekly');
	splitEnabled = $state(false);
	splitBy = $state<'percent' | 'fixed'>('percent');
	billingMilestones = $state<MilestoneDraft[]>([]);

	// ── Invoice recurrence (Jobber "Invoice frequency" → periodic) ──────────────────
	// The repeat rule for periodic invoicing, INDEPENDENT of the visit recurrence (recurShape): a
	// job may VISIT weekly but INVOICE monthly (Jobber lets them differ). Reuses the same
	// RecurrenceShape + RecurringScheduleModal + summarizeRecurrence as the visit rule. Meaningful
	// only when billingFrequency === 'periodic'. No end condition — the invoice window inherits the
	// job's schedule window (Jobber shows no end picker in the billing section). Defaults to the
	// canned monthly-last-day rule so a fresh recurring job lands on Jobber's default.
	invoiceRecurShape = $state<RecurrenceShape>(monthlyLastDayShape());
	invoiceRecurModalOpen = $state(false);

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
		this.billingType === 'fixed' &&
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

	// ── Derived: which inline "Repeats" option is currently active ───────────────────
	// Matches the underlying schedule state back to one dropdown value. Presets are matched
	// against the anchor date's weekday / nth-of-month; anything else reads as 'custom_saved'.
	repeatMode = $derived.by<RepeatMode>(() => {
		if (this.scheduleAsNeeded) return 'as_needed';
		// Deliberately independent of jobMode: a ONE-OFF job may carry a repeat rule (Jobber shows
		// the same Repeats dropdown under both toggle positions). The rule generates visits; the
		// toggle decides how the job bills. Reading jobMode here would blank a one-off's rule.
		if (!this.recurConfigured) return 'none';
		const s = this.recurShape;
		const anchor = this.anchorDate();
		const dow = anchor.getDay();
		const eq = (a: number[] = [], b: number[] = []) =>
			a.length === b.length && a.every((x, i) => x === b[i]);
		if (s.freq === 'day' && s.interval === 1) return 'day';
		if (s.freq === 'week' && s.interval === 1 && eq(s.weekdays, [dow])) return 'week1';
		if (s.freq === 'week' && s.interval === 2 && eq(s.weekdays, [dow])) return 'week2';
		const nth = Math.min(4, Math.ceil(anchor.getDate() / 7));
		if (
			s.freq === 'month' &&
			s.month_mode === 'day_of_week' &&
			s.interval === 1 &&
			s.month_cells.length === 1 &&
			s.month_cells[0].week === nth &&
			s.month_cells[0].weekday === dow
		)
			return 'month';
		// Anything the preset matcher doesn't recognize is a saved custom rule.
		return 'custom_saved';
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

	// ── Derived: which Jobber "Invoice frequency" option recurring billing rests on ──
	// From billingFrequency (+ the invoice rule's shape for the periodic ones). 'custom' (the
	// action row) is never a resting value, so it never appears here.
	billingRepeatMode = $derived.by<BillingRepeatMode>(() => {
		if (this.billingFrequency === 'on_completion') return 'on_completion';
		if (this.billingFrequency === 'per_visit') return 'per_visit';
		if (this.billingFrequency === 'never') return 'never';
		// periodic: the canned monthly-last-day preset, or a saved custom rule.
		return isMonthlyLastDay(this.invoiceRecurShape) ? 'monthly_last' : 'custom_saved';
	});

	// Friendly label for a saved CUSTOM invoice rule (the 'custom_saved' dropdown option), e.g.
	// "Every 2 weeks on Mon". Empty for the canned presets (which have their own fixed labels).
	invoiceRepeatLabel = $derived(
		this.billingRepeatMode === 'custom_saved'
			? summarizeRecurrence({ ...this.invoiceRecurShape, end_type: 'after' } as JobRecurrence)
			: ''
	);

	// ── Helpers ─────────────────────────────────────────────────────────────────────
	// Build the JobRecurrence payload from the modal shape + the page's end condition.
	// Returns null when not in recurring mode or no rule has been saved yet.
	buildRecurrence = (): JobRecurrence | null => {
		// "As needed" carries NO rule (no visits are generated). Otherwise a saved rule is sent
		// whatever the job type is — a one-off can repeat (see `repeatMode`).
		if (this.scheduleAsNeeded || !this.recurConfigured) return null;
		const r: JobRecurrence = {
			freq: this.recurShape.freq,
			interval: Math.max(1, Math.floor(Number(this.recurShape.interval) || 1)),
			end_type: this.endType,
			anytime: this.anytime
		};
		// 'day' (every N days) and 'year' (every N years on the start date) need no
		// weekday/month fields — the interval plus the anchor date is the whole rule.
		if (this.recurShape.freq === 'day' || this.recurShape.freq === 'year') {
			// nothing extra
		} else if (this.recurShape.freq === 'week') {
			r.weekdays = [...this.recurShape.weekdays].sort((a, b) => a - b);
		} else {
			r.month_mode = this.recurShape.month_mode;
			if (this.recurShape.month_mode === 'day_of_month') {
				r.month_days = [...this.recurShape.month_days].sort((a, b) => a - b);
				r.month_last_day = this.recurShape.month_last_day;
			} else {
				r.month_cells = [...this.recurShape.month_cells].sort(
					(a, b) => a.week - b.week || a.weekday - b.weekday
				);
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
		// Saving a custom rule clears any as-needed intent (the two are mutually exclusive). The
		// toggle is deliberately left alone: the modal opens from either job type's dropdown, and
		// giving a one-off a custom rule does not make it recurring.
		this.scheduleAsNeeded = false;
		this.scheduleLater = false;
		if (!this.scheduledStart) this.setDateQuick(0);
	};

	// The local anchor Date the presets read their weekday / nth-of-month from: the chosen
	// start date, or today when none is set yet (mirrors the create page's default-to-today).
	anchorDate = (): Date => {
		const s = this.scheduledStart ? this.scheduledStart.split('T')[0] : '';
		if (s) {
			const [y, m, d] = s.split('-').map(Number);
			return new Date(y, (m ?? 1) - 1, d ?? 1);
		}
		return new Date();
	};

	// Build the recurrence shape for a preset dropdown choice off the anchor date's weekday.
	presetShape = (mode: 'day' | 'week1' | 'week2' | 'month'): RecurrenceShape => {
		const anchor = this.anchorDate();
		const dow = anchor.getDay();
		const base = emptyRecurShape();
		if (mode === 'day') return { ...base, freq: 'day', interval: 1 };
		if (mode === 'week1') return { ...base, freq: 'week', interval: 1, weekdays: [dow] };
		if (mode === 'week2') return { ...base, freq: 'week', interval: 2, weekdays: [dow] };
		const nth = Math.min(4, Math.ceil(anchor.getDate() / 7));
		return {
			...base,
			freq: 'month',
			interval: 1,
			month_mode: 'day_of_week',
			month_cells: [{ week: nth, weekday: dow }]
		};
	};

	// "As needed" job window (Jobber): the job stores a start date + an end boundary but no
	// visits. The boundary comes from the same Ends after / Ends on controls a rule uses:
	// 'on' → end of that day; 'after' → start + N units. Null when the condition is incomplete.
	asNeededEndBoundary = (): Date | null => {
		if (this.endType === 'on') {
			if (!this.endOn) return null;
			const [y, m, d] = this.endOn.split('-').map(Number);
			return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
		}
		const n = Math.floor(Number(this.endAfterCount) || 0);
		if (n < 1) return null;
		const end = this.anchorDate();
		if (this.endAfterUnit === 'days') end.setDate(end.getDate() + n);
		else if (this.endAfterUnit === 'weeks') end.setDate(end.getDate() + n * 7);
		else if (this.endAfterUnit === 'months') end.setMonth(end.getMonth() + n);
		else end.setFullYear(end.getFullYear() + n);
		end.setHours(23, 59, 59, 0);
		return end;
	};

	// The Jobber-style One-off / Recurring toggle — the SOLE authority for job_type. It sets
	// `jobMode` and, deliberately, nothing else: the repeat rule is NOT recurring-only state, so
	// switching to one-off must PRESERVE it. Jobber shows the same Repeats dropdown under both
	// toggle positions because the two answer different questions — the rule decides how visits
	// are generated, the toggle decides how the job bills. A one-off may repeat.
	//
	// The one exception is seeding: a recurring job must repeat somehow and its dropdown carries
	// no "Does not repeat", so flipping to recurring with neither a rule nor an as-needed intent
	// seeds the weekly default rather than resting on an option that isn't offered.
	setJobMode = (mode: JobMode): void => {
		if (mode === this.jobMode) return;
		this.jobMode = mode;
		// Billing UI differs by type (Jobber): one-off = 2 checkboxes (always fixed price); recurring
		// = billing-type radios + an invoice-frequency schedule. Seed each type's SHOWN default when
		// the billing is still pristine, so a toggle lands on Jobber's default rather than a stale
		// cross-type state — but never clobber a schedule the contractor already customized.
		if (mode === 'recurring') {
			const pristineOneOff =
				this.billingType === 'fixed' &&
				this.billingFrequency === 'on_completion' &&
				!this.splitEnabled;
			if (pristineOneOff) {
				// Jobber recurring default (ref/billing/10): Visit based + Monthly on the last day.
				this.billingType = 'visit_based';
				this.billingFrequency = 'periodic';
				this.invoiceRecurShape = monthlyLastDayShape();
			}
		} else {
			// One-off is always fixed price (Jobber). A recurring-only frequency (per_visit / periodic)
			// has no one-off equivalent, so fall back to "invoice when the job is closed".
			this.billingType = 'fixed';
			if (this.billingFrequency === 'per_visit' || this.billingFrequency === 'periodic') {
				this.billingFrequency = 'on_completion';
			}
		}
		if (mode === 'recurring' && !this.recurConfigured && !this.scheduleAsNeeded) {
			this.setRepeatMode('week1');
			return;
		}
		if (!this.scheduledStart) this.setDateQuick(0);
	};

	// Apply an inline "Repeats" dropdown selection. It never touches `jobMode` — the toggle owns
	// that and is the single source of truth for one-off vs recurring. This control is shown for
	// BOTH types (Jobber): it configures how visits are generated, which is independent of how the
	// job bills. Presets compute their rule from the start date; 'custom' opens the modal (which
	// commits via onRecurSaved); 'as_needed' keeps the schedule fields as-is but leaves the job
	// with no rule and no visits.
	setRepeatMode = (mode: RepeatMode): void => {
		if (mode === 'custom') {
			// The action row: open the modal. Nothing changes until the modal saves — cancelling
			// leaves the previous selection intact (the derive still reads the old state).
			this.recurModalOpen = true;
			return;
		}
		// Re-picking the already-saved custom rule is a no-op; it's just the resting label.
		if (mode === 'custom_saved') return;
		if (mode === 'none') {
			// "Does not repeat" — offered in one-off mode only (a recurring job must repeat).
			// Clears the rule; the toggle is untouched.
			this.scheduleAsNeeded = false;
			this.recurConfigured = false;
			this.recurShape = emptyRecurShape();
			return;
		}
		if (mode === 'as_needed') {
			// Jobber renders "As needed" like any other repeat option — the date/time and end
			// fields stay visible (and keep their values); only visit generation is skipped.
			this.scheduleAsNeeded = true;
			this.recurConfigured = false;
			this.scheduleLater = false;
			if (!this.scheduledStart) this.setDateQuick(0);
			return;
		}
		// A concrete preset (Daily / Weekly / Every 2 weeks / Monthly).
		this.scheduleAsNeeded = false;
		this.scheduleLater = false;
		if (!this.scheduledStart) this.setDateQuick(0);
		this.recurShape = this.presetShape(mode);
		this.recurConfigured = true;
	};

	// Apply a Jobber "Invoice frequency" dropdown selection (recurring billing). 'custom' opens the
	// recurrence modal (commits via onInvoiceRecurSaved — nothing changes until Save); 'custom_saved'
	// is the resting label (no-op); the three plain frequencies set billingFrequency directly;
	// 'monthly_last' selects periodic with the canned monthly-last-day rule. Independent of the
	// VISIT repeat rule — this configures how often the job INVOICES.
	setBillingRepeatMode = (mode: BillingRepeatMode): void => {
		if (mode === 'custom') {
			this.invoiceRecurModalOpen = true;
			return;
		}
		if (mode === 'custom_saved') return;
		if (mode === 'on_completion' || mode === 'per_visit' || mode === 'never') {
			this.billingFrequency = mode;
			return;
		}
		// monthly_last
		this.billingFrequency = 'periodic';
		this.invoiceRecurShape = monthlyLastDayShape();
	};

	// Commit a custom invoice schedule from the RecurringScheduleModal → periodic billing.
	onInvoiceRecurSaved = (v: RecurrenceShape): void => {
		this.invoiceRecurShape = v;
		this.billingFrequency = 'periodic';
	};

	// Build the InvoiceRecurrence payload from the shape. Null unless billing is periodic. No end
	// condition — the invoice window inherits the job's schedule window.
	buildInvoiceRecurrence = (): InvoiceRecurrence | null => {
		if (this.billingFrequency !== 'periodic') return null;
		const s = this.invoiceRecurShape;
		const r: InvoiceRecurrence = {
			freq: s.freq,
			interval: Math.max(1, Math.floor(Number(s.interval) || 1))
		};
		if (s.freq === 'week') {
			r.weekdays = [...s.weekdays].sort((a, b) => a - b);
		} else if (s.freq === 'month') {
			r.month_mode = s.month_mode;
			if (s.month_mode === 'day_of_month') {
				r.month_days = [...s.month_days].sort((a, b) => a - b);
				r.month_last_day = s.month_last_day;
			} else {
				r.month_cells = [...s.month_cells].sort((a, b) => a.week - b.week || a.weekday - b.weekday);
			}
		}
		return r;
	};

	// Seed invoiceRecurShape from a stored rule (edit-page hydrate). Missing arrays default empty so
	// the shape is always complete; null → the canned monthly-last-day default.
	hydrateInvoiceRecurrence = (r: InvoiceRecurrence | null): void => {
		if (!r) {
			this.invoiceRecurShape = monthlyLastDayShape();
			return;
		}
		this.invoiceRecurShape = {
			freq: r.freq,
			interval: r.interval,
			weekdays: r.weekdays ? [...r.weekdays] : [],
			month_mode: r.month_mode ?? 'day_of_month',
			month_days: r.month_days ? [...r.month_days] : [],
			month_last_day: r.month_last_day ?? false,
			month_cells: r.month_cells ? r.month_cells.map((c) => ({ ...c })) : []
		};
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
			jobCategory: this.jobCategory,
			tags: [...this.tags].sort().join(','),
			lineItems: JSON.stringify($state.snapshot(this.lineItems)),
			discountType: this.discountType,
			discountValue: this.discountValue,
			discountLabel: this.discountLabel,
			taxRatePct: this.taxRatePct,
			billingType: this.billingType,
			billingFrequency: this.billingFrequency,
			invoiceFrequency: this.invoiceFrequency,
			invoiceRecurShape: JSON.stringify($state.snapshot(this.invoiceRecurShape)),
			splitEnabled: this.splitEnabled,
			splitBy: this.splitBy,
			billingMilestones: JSON.stringify($state.snapshot(this.billingMilestones)),
			jobMode: this.jobMode,
			scheduleAsNeeded: this.scheduleAsNeeded,
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
