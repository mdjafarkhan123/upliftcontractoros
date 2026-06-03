import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, jobs, quotes, invoices, contacts } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_view_all_files) {
		error(403, 'Forbidden: file view permission required');
	}

	const { searchParams } = event.url;
	const contactId = searchParams.get('contact_id');
	const jobId = searchParams.get('job_id');
	const quoteId = searchParams.get('quote_id');
	const invoiceId = searchParams.get('invoice_id');

	if (!contactId && !jobId && !quoteId && !invoiceId) {
		return json(
			{ error: 'At least one of contact_id, job_id, quote_id, invoice_id is required' },
			{ status: 400 }
		);
	}

	// Validate parent belongs to org
	if (contactId) {
		const [c] = await db
			.select({ id: contacts.id, assigned_to: contacts.assigned_to })
			.from(contacts)
			.where(
				and(
					eq(contacts.id, contactId),
					eq(contacts.org_id, auth.orgId),
					isNull(contacts.deleted_at)
				)
			)
			.limit(1);
		if (!c) return json({ error: 'Contact not found' }, { status: 404 });
		// Don't leak existence to members without access to this contact.
		if (!auth.member.can_view_all_contacts && c.assigned_to !== auth.member.id) {
			return json({ error: 'Contact not found' }, { status: 404 });
		}
	}
	if (jobId) {
		const [j] = await db
			.select({ id: jobs.id, assigned_to: jobs.assigned_to })
			.from(jobs)
			.where(and(eq(jobs.id, jobId), eq(jobs.org_id, auth.orgId), isNull(jobs.deleted_at)))
			.limit(1);
		if (!j) return json({ error: 'Job not found' }, { status: 404 });

		// Members with only can_view_assigned_jobs must own the job
		if (!auth.member.can_view_full_pipeline && j.assigned_to !== auth.member.id) {
			error(403, 'Forbidden');
		}
	}
	if (quoteId) {
		const [q] = await db
			.select({ id: quotes.id })
			.from(quotes)
			.where(and(eq(quotes.id, quoteId), eq(quotes.org_id, auth.orgId), isNull(quotes.deleted_at)))
			.limit(1);
		if (!q) return json({ error: 'Quote not found' }, { status: 404 });
	}
	if (invoiceId) {
		const [inv] = await db
			.select({ id: invoices.id })
			.from(invoices)
			.where(
				and(
					eq(invoices.id, invoiceId),
					eq(invoices.org_id, auth.orgId),
					isNull(invoices.deleted_at)
				)
			)
			.limit(1);
		if (!inv) return json({ error: 'Invoice not found' }, { status: 404 });
	}

	const conditions = [eq(media.org_id, auth.orgId), isNull(media.deleted_at)];
	if (contactId) conditions.push(eq(media.contact_id, contactId));
	if (jobId) conditions.push(eq(media.job_id, jobId));
	if (quoteId) conditions.push(eq(media.quote_id, quoteId));
	if (invoiceId) conditions.push(eq(media.invoice_id, invoiceId));

	const rows = await db
		.select({
			id: media.id,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key,
			original_filename: media.original_filename,
			file_size_bytes: media.file_size_bytes,
			media_type: media.media_type,
			mime_type: media.mime_type,
			purpose_tag: media.purpose_tag,
			created_at: media.created_at
		})
		.from(media)
		.where(and(...conditions))
		.orderBy(media.created_at);

	return json({ data: rows });
};
