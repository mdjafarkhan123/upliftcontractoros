import { alias } from 'drizzle-orm/pg-core';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appointments, orgMembers, media } from '$lib/server/db/schema';
import { r2Presign } from '$lib/server/media/r2';
import type { JobVisitRow, JobVisitStatus, JobVisitPhoto } from '$lib/types/jobs';

/**
 * Load every visit (appointment) attached to a job, with its per-visit completion record and
 * photos (S5). Ordered chronologically so the "Visits" list reads top-to-bottom. Two reads +
 * an in-memory group + presign — no N+1. Purely operational, no cost gating (visits carry no
 * money). Cancelled/no-show visits are included so the history stays honest; the UI decides how
 * to surface them.
 */
export async function loadJobVisits(orgId: string, jobId: string): Promise<JobVisitRow[]> {
	const lead = alias(orgMembers, 'visit_lead');
	const completer = alias(orgMembers, 'visit_completer');

	const rows = await db
		.select({
			id: appointments.id,
			type: appointments.type,
			status: appointments.status,
			title: appointments.title,
			scheduled_start: appointments.scheduled_start,
			scheduled_end: appointments.scheduled_end,
			location: appointments.location,
			notes: appointments.notes,
			assignee_name: lead.full_name,
			completed_at: appointments.completed_at,
			completed_by_name: completer.full_name,
			completion_notes: appointments.completion_notes,
			billed_invoice_id: appointments.billed_invoice_id
		})
		.from(appointments)
		.leftJoin(lead, eq(lead.id, appointments.assigned_to))
		.leftJoin(completer, eq(completer.id, appointments.completed_by))
		.where(
			and(
				eq(appointments.job_id, jobId),
				eq(appointments.org_id, orgId),
				isNull(appointments.deleted_at)
			)
		)
		.orderBy(asc(appointments.scheduled_start), asc(appointments.id));

	if (rows.length === 0) return [];

	// One read of every visit photo for this job, then group by line_key (= visit id).
	const photosByVisit = new Map<string, JobVisitPhoto[]>();
	const visitIds = rows.map((r) => r.id);
	const mediaRows = await db
		.select({
			id: media.id,
			line_key: media.line_key,
			r2_key: media.r2_key,
			thumbnail_key: media.thumbnail_key,
			web_key: media.web_key
		})
		.from(media)
		.where(
			and(
				eq(media.job_id, jobId),
				eq(media.org_id, orgId),
				eq(media.purpose_tag, 'job_visit_photo'),
				inArray(media.line_key, visitIds),
				isNull(media.deleted_at)
			)
		)
		.orderBy(asc(media.created_at));

	await Promise.all(
		mediaRows.map(async (m) => {
			if (!m.line_key) return;
			let arr = photosByVisit.get(m.line_key);
			if (!arr) {
				arr = [];
				photosByVisit.set(m.line_key, arr);
			}
			arr.push({
				id: m.id,
				thumb_url: await r2Presign(m.thumbnail_key ?? m.r2_key, 3600),
				full_url: await r2Presign(m.web_key ?? m.r2_key, 3600)
			});
		})
	);

	return rows.map((r) => ({
		id: r.id,
		type: r.type,
		status: r.status as JobVisitStatus,
		title: r.title,
		// NULL start = an unscheduled visit; keep it null rather than crashing on toISOString().
		scheduled_start: r.scheduled_start?.toISOString() ?? null,
		scheduled_end: r.scheduled_end?.toISOString() ?? null,
		location: r.location,
		notes: r.notes,
		assignee_name: r.assignee_name,
		completed_at: r.completed_at?.toISOString() ?? null,
		completed_by_name: r.completed_by_name,
		completion_notes: r.completion_notes,
		billed: r.billed_invoice_id !== null,
		photos: photosByVisit.get(r.id) ?? []
	}));
}
