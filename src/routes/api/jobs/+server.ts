import { json, error } from '@sveltejs/kit';
import {
	and,
	arrayOverlaps,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	appointmentAssignees,
	contacts,
	contactAddresses,
	invoices,
	jobs,
	jobLineItems,
	jobPaymentMilestones,
	jobCustomFields,
	jobCustomFieldValues,
	orgMembers,
	outboxEvents,
	reviewRequests
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyJob } from '$lib/server/jobs/permissions';
import { createJobSchema } from '$lib/server/jobs/schemas';
import { computeLineTotal, recalcJobTotals } from '$lib/server/jobs/recalc';
import { expandRecurrence } from '$lib/server/jobs/recurrence';
import { syncAutoReminders } from '$lib/server/jobs/reminderGeneration';
import { resolveCustomFieldColumns, isCustomFieldFilled } from '$lib/server/jobs/customFieldValues';
import { textMatch, textRank } from '$lib/server/search/textSearch';
import type { JobCustomFieldType } from '$lib/types/jobs';

const PAGE_SIZE = 30;
// Jobber model: jobs.status is only `active` vs `archived`. Every status tab except
// completed/cancelled is a DERIVED face of an `active` job (from its open visits); completed and
// cancelled are the two faces of an `archived` job, told apart by completed_at / cancelled_at.
const VALID_SCOPES = new Set(['today', 'awaiting_review', 'unscheduled']);

function startOfTodayUtc(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfTodayUtc(): Date {
	const d = new Date();
	d.setHours(23, 59, 59, 999);
	return d;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyJob(auth.member)) error(403, 'Forbidden');

	const url = event.url;
	const statusFilter = url.searchParams.get('status');
	const scopeFilter = url.searchParams.get('scope');
	const assignedToFilter = url.searchParams.get('assigned_to');
	const contactIdFilter = url.searchParams.get('contact_id');
	const dateFromFilter = url.searchParams.get('date_from');
	const dateToFilter = url.searchParams.get('date_to');
	const tagsFilter = url.searchParams.getAll('tags').filter(Boolean);
	const searchRaw = (url.searchParams.get('q') ?? '').trim();
	const cursor = url.searchParams.get('cursor');
	// Recycle-bin view: show soft-deleted jobs instead of active ones. Status/scope
	// tabs don't apply in the bin (it shows every deleted job the member can see).
	const deletedFilter = url.searchParams.get('deleted') === '1';

	// ── Visit-truth signals (mirrors deriveJobScheduleState) ───────────────────
	// The status faces are driven by the job's OPEN visits, not its single denormalized date —
	// so recurring/multi-visit jobs (whose scheduled_start is a frozen series anchor) badge and
	// filter correctly. idx_appointments_job_id keeps these correlated scans cheap.
	const nextOpenVisitStartSql = sql<Date | null>`(
		SELECT MIN(a.scheduled_start) FROM ${appointments} a
		WHERE a.job_id = ${jobs.id} AND a.deleted_at IS NULL AND a.status = 'scheduled'
	)`;
	const hasOpenVisitsSql = sql<boolean>`EXISTS (
		SELECT 1 FROM ${appointments} a
		WHERE a.job_id = ${jobs.id} AND a.deleted_at IS NULL AND a.status IN ('scheduled','unscheduled')
	)`;
	// Effective "next open date" for the dated faces: the next open visit, or — as a legacy safety
	// net for a job with no visit rows at all — the job's own date.
	//
	// The fallback is only valid when `scheduled_start` MIRRORS a single visit. It must never fire
	// when that column is a SERIES ANCHOR, which it is whenever the job has a repeat rule (the
	// expansion start, deliberately frozen) or is "as needed" (a stored job WINDOW — the job must
	// read Action Required until visits exist). Note this is NOT the same test as job_type: a
	// one-off may carry a repeat rule, and its anchor is just as frozen. Testing job_type here
	// would make a repeating one-off whose visits are all complete read "Overdue" off its start
	// date instead of "Action Required".
	const mirrorsSingleVisitSql = sql`(${jobs.recurrence} IS NULL AND NOT ${jobs.schedule_as_needed})`;
	const effOpenStartSql = sql`COALESCE(
		${nextOpenVisitStartSql},
		CASE WHEN ${mirrorsSingleVisitSql} AND NOT ${hasOpenVisitsSql} THEN ${jobs.scheduled_start} END
	)`;
	const todayStartTz = sql`${startOfTodayUtc().toISOString()}::timestamptz`;
	const todayEndTz = sql`${endOfTodayUtc().toISOString()}::timestamptz`;

	const conditions: SQL[] = [
		eq(jobs.org_id, auth.orgId),
		deletedFilter ? isNotNull(jobs.deleted_at) : isNull(jobs.deleted_at)
	];

	if (!deletedFilter && statusFilter === 'unscheduled') {
		// Unscheduled: open placeholder visit(s) waiting for a date.
		conditions.push(
			eq(jobs.status, 'active'),
			sql`${effOpenStartSql} IS NULL`,
			sql`${hasOpenVisitsSql}`
		);
	} else if (statusFilter === 'upcoming') {
		// Next open visit is in the future.
		conditions.push(eq(jobs.status, 'active'), sql`${effOpenStartSql} > ${todayEndTz}`);
	} else if (statusFilter === 'today') {
		// Next open visit is today.
		conditions.push(
			eq(jobs.status, 'active'),
			sql`${effOpenStartSql} >= ${todayStartTz}`,
			sql`${effOpenStartSql} <= ${todayEndTz}`
		);
	} else if (statusFilter === 'late') {
		// Next open visit's date has passed and it was never completed (Jobber "Late").
		conditions.push(eq(jobs.status, 'active'), sql`${effOpenStartSql} < ${todayStartTz}`);
	} else if (statusFilter === 'action_required') {
		// Active but no open visits remain — schedule more or close.
		conditions.push(
			eq(jobs.status, 'active'),
			sql`${effOpenStartSql} IS NULL`,
			sql`NOT ${hasOpenVisitsSql}`
		);
	} else if (statusFilter === 'completed') {
		// Archived because the work was finished (completed_at set, not cancelled).
		conditions.push(
			eq(jobs.status, 'archived'),
			isNotNull(jobs.completed_at),
			isNull(jobs.cancelled_at)
		);
	} else if (statusFilter === 'cancelled') {
		// Archived because it was called off (cancelled_at set).
		conditions.push(eq(jobs.status, 'archived'), isNotNull(jobs.cancelled_at));
	}

	if (scopeFilter && VALID_SCOPES.has(scopeFilter)) {
		if (scopeFilter === 'today') {
			// Exclude "As needed": its scheduled_start is a window anchor, not work due today.
			conditions.push(
				eq(jobs.status, 'active'),
				sql`NOT ${jobs.schedule_as_needed}`,
				gte(jobs.scheduled_start, startOfTodayUtc()),
				lte(jobs.scheduled_start, endOfTodayUtc())
			);
		} else if (scopeFilter === 'awaiting_review') {
			conditions.push(eq(jobs.status, 'archived'), isNotNull(jobs.completed_at));
			conditions.push(
				sql`NOT EXISTS (
					SELECT 1 FROM ${reviewRequests}
					WHERE ${reviewRequests.job_id} = ${jobs.id}
					  AND ${reviewRequests.status} IN ('likely_reviewed','completed_internal')
				)`
			);
		} else if (scopeFilter === 'unscheduled') {
			conditions.push(eq(jobs.status, 'active'), isNull(jobs.scheduled_start));
		}
	}

	if (assignedToFilter) {
		conditions.push(eq(jobs.assigned_to, assignedToFilter));
	}

	if (contactIdFilter) {
		conditions.push(eq(jobs.contact_id, contactIdFilter));
	}

	// Advanced filter dropdown: scheduled-date range (inclusive) + tag overlap.
	if (dateFromFilter) {
		const from = new Date(dateFromFilter);
		if (!Number.isNaN(from.getTime())) conditions.push(gte(jobs.scheduled_start, from));
	}
	if (dateToFilter) {
		const to = new Date(dateToFilter);
		if (!Number.isNaN(to.getTime())) conditions.push(lte(jobs.scheduled_start, to));
	}
	if (tagsFilter.length > 0) {
		conditions.push(arrayOverlaps(jobs.tags, tagsFilter));
	}

	if (!auth.member.can_view_full_pipeline) {
		conditions.push(eq(jobs.assigned_to, auth.member.id));
	}

	// Fuzzy search across the job title + the linked contact's name/company.
	// Same shared helper + relevance buckets as the Contacts list; the trigram
	// indexes (jobs.title from 0080, contacts.* from 0079) keep it index-fast.
	const isSearching = searchRaw.length > 0;
	const searchFields = [jobs.title, contacts.full_name, contacts.company_name];
	let relevance: SQL<number> | null = null;
	if (isSearching) {
		relevance = textRank(searchRaw, searchFields);
		conditions.push(textMatch(searchRaw, searchFields));
	}

	if (cursor) {
		if (isSearching && relevance) {
			// Searching orders by relevance first, so the cursor carries the rank:
			// "<rank>|<iso_created_at>|<id>".
			const [rankStr, createdAt, id] = cursor.split('|');
			const rank = Number(rankStr);
			if (Number.isFinite(rank) && createdAt && id) {
				conditions.push(
					or(
						gt(relevance, rank),
						and(eq(relevance, rank), lt(jobs.created_at, new Date(createdAt))),
						and(eq(relevance, rank), eq(jobs.created_at, new Date(createdAt)), lt(jobs.id, id))
					) as SQL
				);
			}
		} else {
			const [createdAt, id] = cursor.split('|');
			if (createdAt && id) {
				conditions.push(
					or(
						lt(jobs.created_at, new Date(createdAt)),
						and(eq(jobs.created_at, new Date(createdAt)), lt(jobs.id, id))
					) as SQL
				);
			}
		}
	}

	// ── Billing badge signals (BILLING.md) ────────────────────────────────────
	// Per-row aggregates over the job's invoices / payment-schedule milestones / visits, kept as
	// flat scalars so `deriveJobBillingBadge` (client) can turn them into at most one badge.
	// All ignore soft-deleted + cancelled invoices. Indexes: idx_invoices_job_id,
	// idx_appointments_job_id, idx_job_payment_milestones_job_id keep these correlated scans cheap.

	// Effectively-overdue: mirrors src/lib/utils/invoices.ts::isEffectivelyOverdue against the DB.
	const hasOverdueSql = sql<boolean>`EXISTS (
		SELECT 1 FROM ${invoices} i
		WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL
		  AND (i.status = 'past_due'
		    OR (i.status IN ('sent_not_due','awaiting_payment') AND i.due_date < CURRENT_DATE AND i.amount_due > 0))
	)`;

	// A sent invoice with money still outstanding (not necessarily overdue).
	const hasUnpaidSentSql = sql<boolean>`EXISTS (
		SELECT 1 FROM ${invoices} i
		WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL
		  AND i.status IN ('sent_not_due','awaiting_payment') AND i.amount_due > 0
	)`;

	// Billable work exists with NO invoice on it yet — create one. Any of: an un-invoiced
	// payment-schedule milestone; a recurring visit-based job with a past unbilled visit (mirrors
	// the generate-invoice endpoint's billable set); or a completed one-off with no invoice + no
	// schedule. A draft that already exists is NOT counted here — that's hasDraftSql ("Send
	// Invoice"), because the work is invoiced, it just needs sending (Jobber keeps these distinct).
	const needsInvoiceSql = sql<boolean>`(
		EXISTS (SELECT 1 FROM ${jobPaymentMilestones} m
			WHERE m.job_id = ${jobs.id} AND m.deleted_at IS NULL AND m.invoice_id IS NULL)
		OR (${jobs.billing_type} = 'visit_based' AND ${jobs.total} > 0
			AND EXISTS (SELECT 1 FROM ${appointments} a
				WHERE a.job_id = ${jobs.id} AND a.deleted_at IS NULL AND a.status <> 'cancelled'
				  AND a.billed_invoice_id IS NULL AND a.scheduled_start <= now()))
		OR (${jobs.job_type} = 'one_off' AND ${jobs.status} = 'archived' AND ${jobs.completed_at} IS NOT NULL
			AND ${jobs.total} > 0
			AND NOT EXISTS (SELECT 1 FROM ${jobPaymentMilestones} m
				WHERE m.job_id = ${jobs.id} AND m.deleted_at IS NULL)
			AND NOT EXISTS (SELECT 1 FROM ${invoices} i
				WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL AND i.status <> 'bad_debt'))
	)`;

	// A draft invoice exists but hasn't been sent yet — the work IS invoiced, it just needs sending.
	const hasDraftSql = sql<boolean>`EXISTS (
		SELECT 1 FROM ${invoices} i
		WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL AND i.status = 'draft'
	)`;

	// Requires Invoicing worklist (Jobber): the same billable-work-with-no-invoice signal that drives
	// the row's "Needs Invoice" badge, surfaced as a filter. Cancelled jobs are excluded (you don't
	// bill a called-off job — mirrors deriveJobBillingBadge returning null for cancelled). This cuts
	// across the schedule tabs, so it's appended here rather than in the mutually-exclusive chain above.
	if (statusFilter === 'requires_invoicing') {
		conditions.push(sql`${needsInvoiceSql}`, isNull(jobs.cancelled_at));
	}

	// Fully collected: at least one non-cancelled invoice exists and none has a balance owing.
	const allSettledSql = sql<boolean>`(
		EXISTS (SELECT 1 FROM ${invoices} i
			WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL AND i.status <> 'bad_debt')
		AND NOT EXISTS (SELECT 1 FROM ${invoices} i
			WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL AND i.status <> 'bad_debt' AND i.amount_due > 0)
	)`;

	// Money collected so far (progress-bar numerator).
	const totalPaidSql = sql<string>`COALESCE((
		SELECT SUM(i.amount_paid) FROM ${invoices} i
		WHERE i.job_id = ${jobs.id} AND i.deleted_at IS NULL AND i.status <> 'bad_debt'
	), 0)`;

	const rowsPromise = db
		.select({
			id: jobs.id,
			title: jobs.title,
			status: jobs.status,
			source: jobs.source,
			contact_id: jobs.contact_id,
			contact_name: contacts.full_name,
			assigned_to: jobs.assigned_to,
			assignee_name: orgMembers.full_name,
			scheduled_start: jobs.scheduled_start,
			scheduled_end: jobs.scheduled_end,
			created_at: jobs.created_at,
			deleted_at: jobs.deleted_at,
			// Close timestamps — let the badge show Completed vs Cancelled for archived jobs.
			completed_at: jobs.completed_at,
			cancelled_at: jobs.cancelled_at,
			next_open_visit_start: nextOpenVisitStartSql,
			has_open_visits: hasOpenVisitsSql,
			has_series_anchor: sql<boolean>`(NOT ${mirrorsSingleVisitSql})`,
			total: jobs.total,
			// The TYPE badge ("Recurring"/"One-off"), read from the stored type and never re-derived
			// from the rule — they are different questions now: an "as needed" job is recurring with
			// no rule, and a one-off may carry a rule. For "does this job repeat?" use the rule
			// (has_series_anchor), not this.
			is_recurring: sql<boolean>`(${jobs.job_type} = 'recurring')`,
			service_address_line_1: jobs.service_address_line_1,
			service_address_city: jobs.service_address_city,
			service_address_state: jobs.service_address_state,
			service_address_zip: jobs.service_address_zip,
			billing_has_overdue: hasOverdueSql,
			billing_needs_invoice: needsInvoiceSql,
			billing_has_draft: hasDraftSql,
			billing_has_unpaid_sent: hasUnpaidSentSql,
			billing_all_settled: allSettledSql,
			billing_total_paid: totalPaidSql,
			rank: relevance ?? sql<number>`0`
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, jobs.assigned_to))
		.where(and(...conditions))
		.orderBy(...(relevance ? [relevance] : []), desc(jobs.created_at), desc(jobs.id))
		.limit(PAGE_SIZE + 1);

	const filterContextPromise =
		contactIdFilter && !cursor
			? db
					.select({ id: contacts.id, full_name: contacts.full_name })
					.from(contacts)
					.where(
						and(
							eq(contacts.id, contactIdFilter),
							eq(contacts.org_id, auth.orgId),
							isNull(contacts.deleted_at)
						)
					)
					.limit(1)
			: Promise.resolve(null);

	const [rows, contactRow] = await Promise.all([rowsPromise, filterContextPromise]);

	const hasMore = rows.length > PAGE_SIZE;
	const sliced = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
	const last = sliced[sliced.length - 1];
	const items = sliced.map(
		({
			rank: _rank,
			billing_has_overdue,
			billing_needs_invoice,
			billing_has_draft,
			billing_has_unpaid_sent,
			billing_all_settled,
			billing_total_paid,
			...r
		}) => ({
			...r,
			billing: {
				has_overdue: billing_has_overdue,
				needs_invoice: billing_needs_invoice,
				has_draft: billing_has_draft,
				has_unpaid_sent: billing_has_unpaid_sent,
				all_settled: billing_all_settled,
				total_paid: billing_total_paid
			}
		})
	);
	const nextCursor =
		hasMore && last
			? isSearching
				? `${last.rank}|${last.created_at.toISOString()}|${last.id}`
				: `${last.created_at.toISOString()}|${last.id}`
			: null;

	const filterContext =
		contactIdFilter && contactRow && contactRow[0]
			? { contact_id: contactRow[0].id, contact_name: contactRow[0].full_name }
			: null;

	return json({ items, next_cursor: nextCursor, filter_context: filterContext });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_full_pipeline) error(403, 'Forbidden');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	const parsed = createJobSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
	}
	const input = parsed.data;

	const [contact] = await db
		.select({ id: contacts.id, full_name: contacts.full_name })
		.from(contacts)
		.where(
			and(
				eq(contacts.id, input.contact_id),
				eq(contacts.org_id, auth.orgId),
				isNull(contacts.deleted_at)
			)
		)
		.limit(1);
	if (!contact) {
		return json({ error: 'Contact not found.' }, { status: 422 });
	}
	// Each visit gets its own default title "{Client} - {Job}" (Jobber pattern), distinct from the
	// bare job title so a multi-visit job reads clearly on the calendar / visit list. Editable per
	// visit afterward.
	const defaultVisitTitle = `${contact.full_name} - ${input.title}`;

	const [primaryAddress] = await db
		.select({
			line_1: contactAddresses.address_line_1,
			line_2: contactAddresses.address_line_2,
			city: contactAddresses.city,
			state: contactAddresses.state,
			zip: contactAddresses.zip
		})
		.from(contactAddresses)
		.where(
			and(
				eq(contactAddresses.contact_id, input.contact_id),
				eq(contactAddresses.org_id, auth.orgId),
				isNull(contactAddresses.deleted_at)
			)
		)
		.orderBy(desc(contactAddresses.is_primary))
		.limit(1);

	if (input.assigned_to) {
		const [assignee] = await db
			.select({ id: orgMembers.id })
			.from(orgMembers)
			.where(
				and(
					eq(orgMembers.id, input.assigned_to),
					eq(orgMembers.org_id, auth.orgId),
					eq(orgMembers.is_active, true),
					isNull(orgMembers.deleted_at)
				)
			)
			.limit(1);
		if (!assignee) {
			return json({ error: 'Assignee is not an active member.' }, { status: 422 });
		}
	}

	// Custom fields (S7): resolve the submitted values against the org's live definitions and
	// enforce the required-field gate here (Zod can't see the definitions). Only runs on the
	// manual create form; jobs auto-created elsewhere skip this entirely, so automation never
	// breaks on required fields. Unknown/deleted field ids are ignored.
	const customFieldColumns = new Map<string, ReturnType<typeof resolveCustomFieldColumns>>();
	if (input.custom_field_values !== undefined) {
		const defs = await db
			.select({
				id: jobCustomFields.id,
				field_type: jobCustomFields.field_type,
				required: jobCustomFields.required
			})
			.from(jobCustomFields)
			.where(and(eq(jobCustomFields.org_id, auth.orgId), isNull(jobCustomFields.deleted_at)));
		const defById = new Map(defs.map((d) => [d.id, d]));

		for (const v of input.custom_field_values) {
			const def = defById.get(v.field_id);
			if (!def) continue;
			customFieldColumns.set(
				v.field_id,
				resolveCustomFieldColumns(def.field_type as JobCustomFieldType, v)
			);
		}

		const missingRequired: string[] = [];
		for (const d of defs) {
			if (!d.required) continue;
			const cols = customFieldColumns.get(d.id) ?? {
				value_text: null,
				value_number: null,
				value_bool: null,
				value_date: null
			};
			if (!isCustomFieldFilled(d.field_type as JobCustomFieldType, cols))
				missingRequired.push(d.id);
		}
		if (missingRequired.length > 0) {
			const field_errors: Record<string, string> = {};
			for (const id of missingRequired) field_errors[id] = 'Required';
			return json({ error: 'Please fill the required fields', field_errors }, { status: 422 });
		}
	}

	// New jobs are always `active` (Jobber model). The badge derives Unscheduled/Upcoming/Today from
	// the visits; the job only becomes `archived` through the /status close endpoint, never here.
	const status = 'active' as const;

	const discountType = input.discount_type ?? 'none';

	// Resolved service address (job columns + each generated visit's location).
	const svcLine1 = input.service_address_line_1 ?? primaryAddress?.line_1 ?? null;
	const svcLine2 = input.service_address_line_2 ?? primaryAddress?.line_2 ?? null;
	const svcCity = input.service_address_city ?? primaryAddress?.city ?? null;
	const svcState = input.service_address_state ?? primaryAddress?.state ?? null;
	const svcZip = input.service_address_zip ?? primaryAddress?.zip ?? null;
	const visitLocation =
		[svcLine1, svcLine2, [svcCity, svcState, svcZip].filter(Boolean).join(', ')]
			.filter(Boolean)
			.join(' · ') || null;

	// Recurring jobs: expand the rule into concrete visits BEFORE the transaction so
	// an empty result is a clean 422 rather than a rolled-back write. The job's own
	// scheduled_start/end is then pinned to the first visit (keeps list scopes /
	// "today" working). Validated above: recurrence implies scheduled_start exists.
	// "As needed" (Jobber): a recurring job with no rule and NO visits, but it still stores its
	// job-level WINDOW — scheduled_start = start day, scheduled_end = end boundary (Ends on /
	// Ends after converted client-side). Any recurrence rule sent alongside is ignored.
	// A repeat rule is NOT a recurring-only concept (Jobber): job_type decides how the job bills,
	// the rule decides how its visits are generated, and a ONE-OFF may carry one — "one visit, or
	// a few visits, until the work is done". So the rule is honored whatever the type is; only
	// "As needed" (which means "no rule, no visits") suppresses it.
	const asNeeded = input.schedule_as_needed === true;
	const recurrence = asNeeded ? null : (input.recurrence ?? null);
	const visits = recurrence
		? expandRecurrence(input.scheduled_start as Date, input.scheduled_end ?? null, recurrence)
		: [];
	if (recurrence && visits.length === 0) {
		return json(
			{ error: 'This recurring schedule produces no visits. Adjust the dates or rule.' },
			{ status: 422 }
		);
	}
	const jobStart = recurrence ? visits[0].start : (input.scheduled_start ?? null);
	// An "Anytime" (all-day) one-off carries a date but no clock time, so it has no end.
	const jobEnd = recurrence
		? visits[0].end
		: asNeeded
			? (input.scheduled_end ?? null)
			: input.all_day
				? null
				: (input.scheduled_end ?? null);

	const created = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(jobs)
			.values({
				org_id: auth.orgId,
				opportunity_id: input.opportunity_id ?? null,
				source: 'manual',
				contact_id: input.contact_id,
				title: input.title,
				status,
				assigned_to: input.assigned_to ?? null,
				// The user's One-off/Recurring decision, stored verbatim and never inferred.
				job_type: input.job_type,
				job_category: input.job_category ?? null,
				tags: input.tags ?? [],
				scheduled_start: jobStart,
				scheduled_end: jobEnd,
				recurrence,
				schedule_as_needed: asNeeded,
				scope_of_work: input.scope_of_work,
				notes: input.notes,
				service_address_line_1: svcLine1,
				service_address_line_2: svcLine2,
				service_address_city: svcCity,
				service_address_state: svcState,
				service_address_zip: svcZip,
				// Pricing — recalcJobTotals computes subtotal/discount_amount/tax_amount/total
				// from the inserted line items below.
				tax_rate: input.tax_rate !== undefined ? String(input.tax_rate) : '0',
				discount_type: discountType,
				discount_value:
					discountType !== 'none' && input.discount_value != null
						? String(input.discount_value)
						: null,
				discount_amount: null,
				discount_label: discountType !== 'none' ? input.discount_label?.trim() || null : null,
				// Billing model (Jobber billingType × billingFrequency) — applied to every job. Server
				// defaults mirror the DB (fixed / on_completion). invoice_frequency only meaningful
				// when billing_frequency='periodic'; cleared otherwise so a stale cadence never lingers.
				billing_type: input.billing_type ?? 'fixed',
				billing_frequency: input.billing_frequency ?? 'on_completion',
				invoice_frequency:
					input.billing_frequency === 'periodic' ? (input.invoice_frequency ?? null) : null,
				// Jobber "Invoice frequency" repeat rule — stored only for periodic billing; NULL
				// otherwise so a stale schedule never lingers on a non-periodic job.
				invoice_recurrence:
					input.billing_frequency === 'periodic' ? (input.invoice_recurrence ?? null) : null,
				completed_at: null
			})
			.returning();

		if (input.line_items && input.line_items.length > 0) {
			await tx.insert(jobLineItems).values(
				input.line_items.map((li, idx) => ({
					org_id: auth.orgId,
					job_id: row.id,
					// undefined → DB default (fresh uuid); never pass null (column is NOT NULL).
					line_key: li.line_key ?? undefined,
					description: li.description,
					details: li.details?.trim() || null,
					quantity: String(li.quantity),
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					unit_price: String(li.unit_price),
					unit_cost: li.unit_cost != null ? String(li.unit_cost) : null,
					// Omitted → true (DB default); mirrors the quote/invoice per-line tax flag.
					taxable: li.taxable ?? true,
					source_catalog_item_id: li.source_catalog_item_id ?? null,
					total: computeLineTotal(li.quantity, li.unit_price),
					position: li.position ?? idx
				}))
			);
			await recalcJobTotals(tx, row.id);
		}

		// Custom fields (S7): persist the resolved values. Only rows with an actual value are
		// written (a fully-empty answer stores nothing). Required ones were already gated above.
		if (customFieldColumns.size > 0) {
			const valueRows = [...customFieldColumns.entries()]
				.filter(
					([, cols]) =>
						cols.value_text !== null ||
						cols.value_number !== null ||
						cols.value_bool !== null ||
						cols.value_date !== null
				)
				.map(([fieldId, cols]) => ({
					org_id: auth.orgId,
					job_id: row.id,
					field_id: fieldId,
					...cols
				}));
			if (valueRows.length > 0) await tx.insert(jobCustomFieldValues).values(valueRows);
		}

		// One-off billing: persist the payment schedule (if any). Dollar amounts for percent
		// rows are derived live at invoice-create time, so only the rule is stored here.
		if (input.payment_milestones && input.payment_milestones.length > 0) {
			await tx.insert(jobPaymentMilestones).values(
				input.payment_milestones.map((m, idx) => ({
					org_id: auth.orgId,
					job_id: row.id,
					key: m.key ?? undefined,
					position: idx,
					description: m.description,
					amount_type: m.amount_type,
					amount_value: String(m.amount_value),
					due_date: m.due_date ?? null
				}))
			);
		}

		// Recurring jobs: materialize every visit as an appointment (job_id link) so
		// each lands on the calendar and is individually reschedulable / completable.
		// Visits reuse the 'job_start' type; the lead assignee (if any) is mirrored
		// into appointment_assignees. The per-visit reminder worker picks these up
		// automatically via the default reminder flags.
		if (recurrence && visits.length > 0) {
			const insertedVisits = await tx
				.insert(appointments)
				.values(
					visits.map((v) => ({
						org_id: auth.orgId,
						contact_id: row.contact_id,
						job_id: row.id,
						assigned_to: input.assigned_to ?? null,
						type: 'job_start' as const,
						status: 'scheduled' as const,
						title: defaultVisitTitle,
						scheduled_start: v.start,
						scheduled_end: v.end,
						location: visitLocation,
						notes: input.visit_instructions ?? null
					}))
				)
				.returning({
					id: appointments.id,
					scheduled_start: appointments.scheduled_start,
					scheduled_end: appointments.scheduled_end
				});

			if (input.assigned_to) {
				await tx.insert(appointmentAssignees).values(
					insertedVisits.map((a) => ({
						appointment_id: a.id,
						member_id: input.assigned_to as string,
						org_id: auth.orgId,
						is_lead: true
					}))
				);
			}

			// Enroll every visit in the existing appointment-reminder engine (Session B):
			// one `appointment.created` per visit so each gets reminders anchored to its
			// own scheduled_start. Mirrors the appointments API emit. Confirmation no-ops
			// (not a booking_link); pipeline auto-advance is idempotent past "Scheduled".
			const assigneeIds = input.assigned_to ? [input.assigned_to] : [];
			await tx.insert(outboxEvents).values(
				insertedVisits.map((v) => ({
					org_id: auth.orgId,
					event_type: 'appointment.created' as const,
					resource_type: 'appointment',
					resource_id: v.id,
					payload: {
						appointment_id: v.id,
						org_id: auth.orgId,
						contact_id: row.contact_id,
						job_id: row.id,
						assigned_to: input.assigned_to ?? null,
						assignee_ids: assigneeIds,
						// Non-null: recurring visits are always expanded with a concrete date.
						scheduled_start: v.scheduled_start!.toISOString(),
						scheduled_end: v.scheduled_end?.toISOString() ?? null
					},
					idempotency_key: `appointment.created:${v.id}`
				}))
			);
		}

		// One-off jobs: a single scheduled job IS one visit on the calendar (Jobber /
		// Housecall Pro). Materialize that visit so the job lands on the calendar
		// instantly and is reschedulable / completable like any other visit. Recurring
		// jobs are handled above; unscheduled ("Anytime") jobs get no visit and stay in
		// the Unscheduled list. "As needed" jobs store a window but NEVER get a visit here
		// (that's the whole point — the contractor adds visits manually later).
		if (!recurrence && !asNeeded && jobStart) {
			const [visit] = await tx
				.insert(appointments)
				.values({
					org_id: auth.orgId,
					contact_id: row.contact_id,
					job_id: row.id,
					assigned_to: input.assigned_to ?? null,
					type: 'job_start' as const,
					status: 'scheduled' as const,
					title: defaultVisitTitle,
					// "Anytime" visit: a date, no clock time — renders in the calendar's Anytime lane
					// and the reminder worker skips it (nothing to remind before).
					all_day: input.all_day ?? false,
					scheduled_start: jobStart,
					scheduled_end: jobEnd,
					location: visitLocation,
					notes: null
				})
				.returning({
					id: appointments.id,
					scheduled_start: appointments.scheduled_start,
					scheduled_end: appointments.scheduled_end
				});

			if (input.assigned_to) {
				await tx.insert(appointmentAssignees).values({
					appointment_id: visit.id,
					member_id: input.assigned_to,
					org_id: auth.orgId,
					is_lead: true
				});
			}

			// Enroll the visit in the appointment engine: schedules its 24h/1h reminders
			// and ratchets the pipeline to "Scheduled". The customer confirmation handler
			// no-ops for non-booking-link visits, so this does NOT double-notify alongside
			// the `job.scheduled` confirmation emitted below.
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'appointment.created' as const,
				resource_type: 'appointment',
				resource_id: visit.id,
				payload: {
					appointment_id: visit.id,
					org_id: auth.orgId,
					contact_id: row.contact_id,
					job_id: row.id,
					assigned_to: input.assigned_to ?? null,
					assignee_ids: input.assigned_to ? [input.assigned_to] : [],
					// Non-null: this branch only runs when the one-off job has a start (jobStart).
					scheduled_start: visit.scheduled_start!.toISOString(),
					scheduled_end: visit.scheduled_end?.toISOString() ?? null
				},
				idempotency_key: `appointment.created:${visit.id}`
			});
		}

		// Jobber "Schedule later": a one-off job created with no date still gets ONE visit —
		// an UNSCHEDULED placeholder (no date, status 'unscheduled'). It never lands on the
		// calendar or fires reminders (both are date-windowed), so no appointment.created
		// outbox event is enqueued here; it only surfaces in the job's Visits list, where the
		// contractor can complete it or give it a date later. Skipped for recurring jobs
		// (they always expand to dated visits) and for one-off jobs that DID get a date above.
		// "As needed" is deliberately EXCLUDED: it wants zero visits (not even a placeholder).
		if (!recurrence && !jobStart && input.schedule_later && !asNeeded) {
			const [visit] = await tx
				.insert(appointments)
				.values({
					org_id: auth.orgId,
					contact_id: row.contact_id,
					job_id: row.id,
					assigned_to: input.assigned_to ?? null,
					type: 'job_start' as const,
					status: 'unscheduled' as const,
					title: defaultVisitTitle,
					scheduled_start: null,
					scheduled_end: null,
					location: visitLocation,
					notes: null
				})
				.returning({ id: appointments.id });

			if (input.assigned_to) {
				await tx.insert(appointmentAssignees).values({
					appointment_id: visit.id,
					member_id: input.assigned_to,
					org_id: auth.orgId,
					is_lead: true
				});
			}
		}

		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'job.created.manual',
			resource_type: 'job',
			resource_id: row.id,
			payload: {
				job_id: row.id,
				org_id: auth.orgId,
				contact_id: row.contact_id,
				assigned_to: row.assigned_to,
				status: row.status,
				created_at: row.created_at
			},
			idempotency_key: `job.created.manual:${row.id}`
		});

		// Client-facing schedule confirmation. Only when the contractor picked a
		// channel AND the job actually has a start date — the worker fans out to
		// SMS/email and respects opt-out / channel availability.
		if (input.notify_channel && input.notify_channel !== 'none' && row.scheduled_start) {
			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'job.scheduled',
				resource_type: 'job',
				resource_id: row.id,
				payload: {
					job_id: row.id,
					org_id: auth.orgId,
					contact_id: row.contact_id,
					channel: input.notify_channel,
					scheduled_start: row.scheduled_start,
					// Per-job copy overrides (null = worker falls back to the org template).
					sms_message: input.notify_sms_message ?? null,
					email_subject: input.notify_email_subject ?? null,
					email_message: input.notify_email_message ?? null
				},
				// Time-stamped so a later reschedule-notify (same job, new time) is a
				// distinct event rather than a unique-key collision that silently drops.
				idempotency_key: `job.scheduled:${row.id}:${row.scheduled_start.getTime()}`
			});
		}

		// Materialize the job's invoice reminders from its billing_frequency (Jobber B3.2).
		// Runs after every visit is inserted so per_visit reminders see their visits. Manual
		// reminders don't exist yet on a fresh job; this only creates source='auto' rows.
		await syncAutoReminders(tx, auth.orgId, row.id);

		return row;
	});

	return json({ job: created }, { status: 201 });
};
