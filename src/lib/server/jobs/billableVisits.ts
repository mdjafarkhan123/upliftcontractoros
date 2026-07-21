// Read helper for the "Select visits to invoice" flow (Jobber ref/billing/20-21).
//
// A visit-based job bills its PAST/completed visits, one line per visit priced at the job's
// line-item total. Before creating that invoice the contractor picks WHICH visits go on it —
// this loader returns the set the picker (and the recurring Invoicing-tab "Create" row) shows.
//
// The set matches live Jobber (ref/billing/21, verified 2026-07-20): **every uninvoiced, non-
// cancelled DATED visit on-or-before today, PLUS the single next upcoming visit** (the invoice-
// ahead row). Each visit's subtotal is the job's total (visit_based pricing); the job header row
// subtotal is their sum. Empty for any billing_type other than 'visit_based' — a fixed job has no
// visits to select, it snapshots line items instead.

import { and, asc, eq, gt, isNull, lte, ne } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appointments, contacts, jobs } from '$lib/server/db/schema';

// Per-visit face in the picker. 'overdue' = its date has passed (Jobber calls a past invoice
// visit "Overdue"); 'today' = due today; 'upcoming' = the single invoice-ahead visit.
export type BillableVisitStatus = 'overdue' | 'today' | 'upcoming';

export type BillableVisit = {
	id: string;
	title: string;
	scheduled_start: string; // ISO — always dated (the loader filters out null-start visits)
	status: BillableVisitStatus;
	subtotal: string; // numeric string (job total per visit)
};

export type BillableVisitsResult = {
	job: {
		id: string;
		title: string;
		contact_name: string;
		// Carried for the route's canViewJob check; not shown in the picker UI.
		assigned_to: string | null;
		address: string | null;
		// Rollup face for the job header row: 'late' if any visit is overdue, else 'today' if any is
		// today, else 'upcoming'. Null when there are no billable visits at all.
		status: 'late' | 'today' | 'upcoming' | null;
		subtotal: string; // sum of the visit subtotals
		completed_visit_count: number; // "N visits completed" (Uninvoiced column)
	};
	visits: BillableVisit[];
};

function formatJobAddress(row: {
	service_address_line_1: string | null;
	service_address_line_2: string | null;
	service_address_city: string | null;
	service_address_state: string | null;
	service_address_zip: string | null;
}): string | null {
	const cityLine = [row.service_address_city, row.service_address_state, row.service_address_zip]
		.filter(Boolean)
		.join(', ');
	return (
		[row.service_address_line_1, row.service_address_line_2, cityLine].filter(Boolean).join(', ') ||
		null
	);
}

function visitStatus(start: Date, now: Date): BillableVisitStatus {
	const dayStart = new Date(now);
	dayStart.setHours(0, 0, 0, 0);
	const dayEnd = new Date(now);
	dayEnd.setHours(23, 59, 59, 999);
	if (start > dayEnd) return 'upcoming';
	if (start >= dayStart) return 'today';
	return 'overdue';
}

// Loads the billable-visit set for a job. Returns null when the job doesn't exist / isn't this org's
// (the caller 404s). The permission check lives in the route.
export async function loadBillableVisits(
	orgId: string,
	jobId: string,
	now: Date = new Date()
): Promise<BillableVisitsResult | null> {
	const [job] = await db
		.select({
			id: jobs.id,
			title: jobs.title,
			contact_name: contacts.full_name,
			assigned_to: jobs.assigned_to,
			billing_type: jobs.billing_type,
			total: jobs.total,
			service_address_line_1: jobs.service_address_line_1,
			service_address_line_2: jobs.service_address_line_2,
			service_address_city: jobs.service_address_city,
			service_address_state: jobs.service_address_state,
			service_address_zip: jobs.service_address_zip
		})
		.from(jobs)
		.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
		.where(and(eq(jobs.id, jobId), eq(jobs.org_id, orgId), isNull(jobs.deleted_at)))
		.limit(1);
	if (!job) return null;

	const base = {
		id: job.id,
		title: job.title,
		contact_name: job.contact_name,
		assigned_to: job.assigned_to,
		address: formatJobAddress(job)
	};

	// Only a visit-based job has selectable visits (a fixed job snapshots its line items).
	if (job.billing_type !== 'visit_based') {
		return {
			job: { ...base, status: null, subtotal: '0.00', completed_visit_count: 0 },
			visits: []
		};
	}

	const dayEnd = new Date(now);
	dayEnd.setHours(23, 59, 59, 999);

	const commonWhere = (extra: ReturnType<typeof gt> | ReturnType<typeof lte>) =>
		and(
			eq(appointments.job_id, jobId),
			eq(appointments.org_id, orgId),
			isNull(appointments.deleted_at),
			isNull(appointments.billed_invoice_id),
			ne(appointments.status, 'cancelled'),
			extra
		);

	// Two INDEPENDENT reads (Rule 20): the on-or-before-today visits, and the single next upcoming
	// one (the invoice-ahead row). Both filter out null-start (unscheduled) visits via the range.
	const [dueVisits, upcomingVisits] = await Promise.all([
		db
			.select({
				id: appointments.id,
				title: appointments.title,
				scheduled_start: appointments.scheduled_start,
				status: appointments.status
			})
			.from(appointments)
			.where(commonWhere(lte(appointments.scheduled_start, dayEnd)))
			.orderBy(asc(appointments.scheduled_start)),
		db
			.select({
				id: appointments.id,
				title: appointments.title,
				scheduled_start: appointments.scheduled_start,
				status: appointments.status
			})
			.from(appointments)
			.where(commonWhere(gt(appointments.scheduled_start, dayEnd)))
			.orderBy(asc(appointments.scheduled_start))
			.limit(1)
	]);

	const perVisit = Number(job.total);
	const perVisitStr = perVisit.toFixed(2);
	const ordered = [...dueVisits, ...upcomingVisits];

	const visits: BillableVisit[] = ordered.map((v) => ({
		id: v.id,
		title: v.title,
		// Non-null: both queries filter scheduled_start against a concrete range.
		scheduled_start: v.scheduled_start!.toISOString(),
		status: visitStatus(v.scheduled_start!, now),
		subtotal: perVisitStr
	}));

	const hasOverdue = visits.some((v) => v.status === 'overdue');
	const hasToday = visits.some((v) => v.status === 'today');
	const rollup: 'late' | 'today' | 'upcoming' | null =
		visits.length === 0 ? null : hasOverdue ? 'late' : hasToday ? 'today' : 'upcoming';

	const completedVisitCount = ordered.filter((v) => v.status === 'completed').length;
	const jobSubtotal = (perVisit * visits.length).toFixed(2);

	return {
		job: {
			...base,
			status: rollup,
			subtotal: jobSubtotal,
			completed_visit_count: completedVisitCount
		},
		visits
	};
}
