import { json } from '@sveltejs/kit';
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	opportunities,
	jobs,
	quotes,
	invoices,
	appointments
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { normalizeSearchTerm, textMatch, textRank } from '$lib/server/search/textSearch';
import { canViewAnyJob } from '$lib/server/jobs/permissions';
import { canViewAnyQuote } from '$lib/server/quotes/permissions';
import { canViewAnyInvoice } from '$lib/server/invoices/permissions';
import { canViewAnyAppointment } from '$lib/server/appointments/permissions';
import { pipelineScopeFor } from '$lib/server/pipeline/permissions';

// Per-group cap. The palette is a "jump to record" tool, not a list view — a
// handful of best matches per type is the industry norm (Pipedrive/HubSpot).
const PER_GROUP = 5;
// Below this the trigram/substring scan is too broad to be useful; the box just
// waits for more input. Matches the typeahead minimum used across the app.
const MIN_LEN = 2;

type SearchItem = { id: string; title: string; subtitle: string | null; href: string };

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	const { orgId, member } = auth;

	const term = normalizeSearchTerm(event.url.searchParams.get('q'));
	if (!term || term.length < MIN_LEN) {
		return json({
			data: {
				contacts: [],
				opportunities: [],
				jobs: [],
				quotes: [],
				invoices: [],
				appointments: []
			}
		});
	}

	const digits = term.replace(/\D+/g, '');
	const isDigits = digits.length >= 2 && digits.length === term.replace(/\s+/g, '').length;

	// Linked-contact name is searchable everywhere because contacts.full_name /
	// company_name are trigram-indexed (0079). Aliased for the subtitle.
	const contactName = sql<string | null>`${contacts.full_name}`.as('contact_name');

	// --- Contacts ------------------------------------------------------------
	// Always viewable; restricted members (no can_view_all_contacts) only see
	// contacts assigned to them — exactly the /api/contacts gate.
	const contactsQuery = (async (): Promise<SearchItem[]> => {
		const fields = [contacts.full_name, contacts.company_name, contacts.email];
		const conditions: SQL[] = [
			eq(contacts.org_id, orgId),
			isNull(contacts.deleted_at),
			sql`(${contacts.phone} IS NULL OR ${contacts.phone} NOT LIKE 'RELEASED:%')`
		];
		if (!member.can_view_all_contacts) conditions.push(eq(contacts.assigned_to, member.id));

		const phoneClauses: SQL[] = [];
		if (digits.length >= 3) {
			phoneClauses.push(ilike(contacts.phone, `%${digits}%`));
			phoneClauses.push(ilike(contacts.alt_phone, `%${digits}%`));
		}
		const match = or(textMatch(term, fields), ...phoneClauses);
		if (match) conditions.push(match);

		const rows = await db
			.select({
				id: contacts.id,
				full_name: contacts.full_name,
				company_name: contacts.company_name,
				phone: contacts.phone,
				email: contacts.email
			})
			.from(contacts)
			.where(and(...conditions))
			.orderBy(textRank(term, fields), desc(contacts.created_at))
			.limit(PER_GROUP);

		return rows.map((r) => ({
			id: r.id,
			title: r.full_name,
			subtitle: r.company_name ?? r.phone ?? r.email ?? null,
			href: `/contacts/${r.id}`
		}));
	})();

	// --- Pipeline opportunities ---------------------------------------------
	const scope = pipelineScopeFor(member);
	const opportunitiesQuery = (async (): Promise<SearchItem[]> => {
		if (scope === 'none') return [];
		const fields = [opportunities.title, contacts.full_name, contacts.company_name];
		const conditions: SQL[] = [eq(opportunities.org_id, orgId), isNull(opportunities.deleted_at)];
		if (scope === 'mine') conditions.push(eq(opportunities.assigned_to, member.id));
		conditions.push(textMatch(term, fields));

		const rows = await db
			.select({
				id: opportunities.id,
				title: opportunities.title,
				contact_name: contactName
			})
			.from(opportunities)
			.innerJoin(contacts, eq(contacts.id, opportunities.contact_id))
			.where(and(...conditions))
			.orderBy(textRank(term, fields), desc(opportunities.created_at))
			.limit(PER_GROUP);

		return rows.map((r) => ({
			id: r.id,
			title: r.title,
			subtitle: r.contact_name,
			href: `/pipeline/${r.id}`
		}));
	})();

	// --- Jobs ----------------------------------------------------------------
	const jobsQuery = (async (): Promise<SearchItem[]> => {
		if (!canViewAnyJob(member)) return [];
		const fields = [jobs.title, contacts.full_name, contacts.company_name];
		const conditions: SQL[] = [eq(jobs.org_id, orgId), isNull(jobs.deleted_at)];
		// Restricted members (no full pipeline) only see jobs assigned to them.
		if (!member.can_view_full_pipeline) conditions.push(eq(jobs.assigned_to, member.id));
		conditions.push(textMatch(term, fields));

		const rows = await db
			.select({
				id: jobs.id,
				title: jobs.title,
				contact_name: contactName
			})
			.from(jobs)
			.innerJoin(contacts, eq(contacts.id, jobs.contact_id))
			.where(and(...conditions))
			.orderBy(textRank(term, fields), desc(jobs.created_at))
			.limit(PER_GROUP);

		return rows.map((r) => ({
			id: r.id,
			title: r.title,
			subtitle: r.contact_name,
			href: `/jobs/${r.id}`
		}));
	})();

	// --- Quotes --------------------------------------------------------------
	const quotesQuery = (async (): Promise<SearchItem[]> => {
		if (!canViewAnyQuote(member)) return [];
		const fields = [quotes.title, contacts.full_name, contacts.company_name];
		const conditions: SQL[] = [eq(quotes.org_id, orgId), isNull(quotes.deleted_at)];
		const numberClause = isDigits
			? sql`CAST(${quotes.quote_number} AS text) LIKE ${`${digits}%`}`
			: null;
		const match = numberClause
			? or(textMatch(term, fields), numberClause)
			: textMatch(term, fields);
		if (match) conditions.push(match);

		const rows = await db
			.select({
				id: quotes.id,
				title: quotes.title,
				quote_number: quotes.quote_number,
				contact_name: contactName
			})
			.from(quotes)
			.innerJoin(contacts, eq(contacts.id, quotes.contact_id))
			.where(and(...conditions))
			.orderBy(textRank(term, fields), desc(quotes.created_at))
			.limit(PER_GROUP);

		return rows.map((r) => ({
			id: r.id,
			title: `#${r.quote_number} · ${r.title}`,
			subtitle: r.contact_name,
			href: `/quotes/${r.id}`
		}));
	})();

	// --- Invoices ------------------------------------------------------------
	const invoicesQuery = (async (): Promise<SearchItem[]> => {
		if (!canViewAnyInvoice(member)) return [];
		const fields = [invoices.title, contacts.full_name, contacts.company_name];
		const conditions: SQL[] = [eq(invoices.org_id, orgId), isNull(invoices.deleted_at)];
		const numberClause = isDigits
			? sql`CAST(${invoices.invoice_number} AS text) LIKE ${`${digits}%`}`
			: null;
		const match = numberClause
			? or(textMatch(term, fields), numberClause)
			: textMatch(term, fields);
		if (match) conditions.push(match);

		const rows = await db
			.select({
				id: invoices.id,
				title: invoices.title,
				invoice_number: invoices.invoice_number,
				contact_name: contactName
			})
			.from(invoices)
			.innerJoin(contacts, eq(contacts.id, invoices.contact_id))
			.where(and(...conditions))
			.orderBy(textRank(term, fields), desc(invoices.created_at))
			.limit(PER_GROUP);

		return rows.map((r) => ({
			id: r.id,
			title: `#${r.invoice_number} · ${r.title}`,
			subtitle: r.contact_name,
			href: `/invoices/${r.id}`
		}));
	})();

	// --- Appointments --------------------------------------------------------
	const appointmentsQuery = (async (): Promise<SearchItem[]> => {
		if (!canViewAnyAppointment(member)) return [];
		// Title + location are both trigram-indexed (0081); contact name via 0079.
		const fields = [
			appointments.title,
			appointments.location,
			contacts.full_name,
			contacts.company_name
		];
		const conditions: SQL[] = [eq(appointments.org_id, orgId), isNull(appointments.deleted_at)];
		// Restricted members (no view-all) only see appointments assigned to them.
		if (!member.can_view_all_appointments) conditions.push(eq(appointments.assigned_to, member.id));
		conditions.push(textMatch(term, fields));

		const rows = await db
			.select({
				id: appointments.id,
				title: appointments.title,
				location: appointments.location,
				contact_name: contactName
			})
			.from(appointments)
			.leftJoin(contacts, eq(contacts.id, appointments.contact_id))
			.where(and(...conditions))
			.orderBy(textRank(term, fields), desc(appointments.created_at))
			.limit(PER_GROUP);

		return rows.map((r) => ({
			id: r.id,
			title: r.title,
			subtitle: r.contact_name ?? r.location ?? null,
			href: `/appointments/${r.id}`
		}));
	})();

	const [
		contactsResult,
		opportunitiesResult,
		jobsResult,
		quotesResult,
		invoicesResult,
		appointmentsResult
	] = await Promise.all([
		contactsQuery,
		opportunitiesQuery,
		jobsQuery,
		quotesQuery,
		invoicesQuery,
		appointmentsQuery
	]);

	return json({
		data: {
			contacts: contactsResult,
			opportunities: opportunitiesResult,
			jobs: jobsResult,
			quotes: quotesResult,
			invoices: invoicesResult,
			appointments: appointmentsResult
		}
	});
};
