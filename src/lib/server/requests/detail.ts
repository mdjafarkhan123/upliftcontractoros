import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	appointments,
	contacts,
	media,
	requestFieldAnswers,
	requestLineItems,
	requests
} from '$lib/server/db/schema';
import { r2Presign } from '$lib/server/media/r2';
import { deriveRequestStatus, type RequestDerivedStatus } from './status';

// The one request payload every endpoint returns (GET detail, and each mutation's
// write-through response so client stores can patch without a refetch). Reads run
// as ONE concurrent wave (Rule 24 — no query waterfalls).

export type RequestAssessmentPayload = {
	id: string;
	title: string;
	status: 'scheduled' | 'unscheduled' | 'completed' | 'cancelled' | 'no_show';
	scheduled_start: string | null;
	scheduled_end: string | null;
	all_day: boolean;
	location: string | null;
	notes: string | null;
	assigned_to: string | null;
	assignee_ids: string[];
	completed_at: string | null;
	completion_notes: string | null;
};

export type RequestPhotoPayload = {
	id: string;
	original_filename: string;
	// Presigned URLs (thumbnail for the grid, web for the lightbox) — ready to
	// render, so the client renders photos in one round-trip (no per-photo fetch).
	thumbnail_url: string;
	web_url: string;
};

export type RequestCustomAnswerPayload = {
	id: string;
	question_label: string;
	question_type: string;
	// One is set: value_text for single-value types, value_json (string[]) for multi.
	value_text: string | null;
	value_json: string[] | null;
};

export type RequestLineItemPayload = {
	id: string;
	line_key: string;
	description: string;
	details: string | null;
	quantity: string;
	unit: string | null;
	unit_price: string;
	unit_cost: string | null;
	taxable: boolean;
	source_catalog_item_id: string | null;
	total: string;
	position: number;
};

export type RequestDetailPayload = {
	id: string;
	title: string;
	service_details: string | null;
	lead_source_answer: string | null;
	source: 'internal' | 'public_form';
	booking_link_id: string | null;
	approval_state: 'not_required' | 'pending' | 'accepted' | 'declined';
	approval_decided_at: string | null;
	converted_to_quote_id: string | null;
	converted_to_job_id: string | null;
	converted_at: string | null;
	archived_at: string | null;
	notes: string | null;
	requested_at: string;
	created_at: string;
	updated_at: string;
	status: RequestDerivedStatus;
	// Sum of line totals — requests have no discount/tax math (Jobber model).
	total: string;
	contact: {
		id: string;
		full_name: string;
		company_name: string | null;
		phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
	};
	line_items: RequestLineItemPayload[];
	assessment: RequestAssessmentPayload | null;
	// Client-attached photos ("Share images of the work to be done").
	photos: RequestPhotoPayload[];
	// Answers to the form's custom questions (R5.2b) — snapshot label/type/value.
	custom_answers: RequestCustomAnswerPayload[];
};

export async function loadRequestDetail(
	orgId: string,
	requestId: string,
	timezone: string
): Promise<RequestDetailPayload | null> {
	const [requestRows, lineRows, assessmentRows, photoRows, answerRows] = await Promise.all([
		db
			.select({
				request: requests,
				contact_full_name: contacts.full_name,
				contact_company_name: contacts.company_name,
				contact_phone: contacts.phone,
				contact_email: contacts.email,
				contact_status: contacts.status
			})
			.from(requests)
			.innerJoin(contacts, eq(contacts.id, requests.contact_id))
			.where(
				and(eq(requests.id, requestId), eq(requests.org_id, orgId), isNull(requests.deleted_at))
			)
			.limit(1),
		db
			.select()
			.from(requestLineItems)
			.where(
				and(
					eq(requestLineItems.request_id, requestId),
					eq(requestLineItems.org_id, orgId),
					isNull(requestLineItems.deleted_at)
				)
			)
			.orderBy(asc(requestLineItems.position), asc(requestLineItems.created_at)),
		db
			.select({
				id: appointments.id,
				title: appointments.title,
				status: appointments.status,
				scheduled_start: appointments.scheduled_start,
				scheduled_end: appointments.scheduled_end,
				all_day: appointments.all_day,
				location: appointments.location,
				notes: appointments.notes,
				assigned_to: appointments.assigned_to,
				assignee_ids: sql<string[]>`(
					SELECT COALESCE(array_agg(aa.member_id), '{}') FROM appointment_assignees aa
					WHERE aa.appointment_id = ${appointments.id}
				)`,
				completed_at: appointments.completed_at,
				completion_notes: appointments.completion_notes
			})
			.from(appointments)
			.where(
				and(
					eq(appointments.request_id, requestId),
					eq(appointments.org_id, orgId),
					isNull(appointments.deleted_at)
				)
			)
			.limit(1),
		db
			.select({
				id: media.id,
				original_filename: media.original_filename,
				thumbnail_key: media.thumbnail_key,
				web_key: media.web_key,
				r2_key: media.r2_key
			})
			.from(media)
			.where(
				and(
					eq(media.request_id, requestId),
					eq(media.org_id, orgId),
					eq(media.purpose_tag, 'request_photo'),
					isNull(media.deleted_at)
				)
			)
			.orderBy(asc(media.created_at)),
		db
			.select({
				id: requestFieldAnswers.id,
				question_label: requestFieldAnswers.question_label,
				question_type: requestFieldAnswers.question_type,
				value_text: requestFieldAnswers.value_text,
				value_json: requestFieldAnswers.value_json,
				position: requestFieldAnswers.position
			})
			.from(requestFieldAnswers)
			.where(
				and(
					eq(requestFieldAnswers.request_id, requestId),
					eq(requestFieldAnswers.org_id, orgId)
				)
			)
			.orderBy(asc(requestFieldAnswers.position), asc(requestFieldAnswers.created_at))
	]);

	const row = requestRows[0];
	if (!row) return null;
	const r = row.request;
	const a = assessmentRows[0] ?? null;

	// Presign thumbnail + web variants once so the client renders photos without a
	// per-photo round-trip. Depends on photoRows, so it runs after the read wave.
	const photos = await Promise.all(
		photoRows.map(async (p) => ({
			id: p.id,
			original_filename: p.original_filename,
			thumbnail_url: await r2Presign(p.thumbnail_key ?? p.r2_key, 3600),
			web_url: await r2Presign(p.web_key ?? p.r2_key, 3600)
		}))
	);

	const status = deriveRequestStatus(
		{ approval_state: r.approval_state, converted_at: r.converted_at, archived_at: r.archived_at },
		a
			? {
					status: a.status,
					scheduled_start: a.scheduled_start,
					scheduled_end: a.scheduled_end,
					all_day: a.all_day
				}
			: null,
		{ timezone }
	);

	const total = lineRows.reduce((sum, li) => sum + Number(li.total), 0);

	return {
		id: r.id,
		title: r.title,
		service_details: r.service_details,
		lead_source_answer: r.lead_source_answer,
		source: r.source,
		booking_link_id: r.booking_link_id,
		approval_state: r.approval_state,
		approval_decided_at: r.approval_decided_at?.toISOString() ?? null,
		converted_to_quote_id: r.converted_to_quote_id,
		converted_to_job_id: r.converted_to_job_id,
		converted_at: r.converted_at?.toISOString() ?? null,
		archived_at: r.archived_at?.toISOString() ?? null,
		notes: r.notes,
		requested_at: r.requested_at.toISOString(),
		created_at: r.created_at.toISOString(),
		updated_at: r.updated_at.toISOString(),
		status,
		total: total.toFixed(2),
		contact: {
			id: r.contact_id,
			full_name: row.contact_full_name,
			company_name: row.contact_company_name,
			phone: row.contact_phone,
			email: row.contact_email,
			status: row.contact_status
		},
		line_items: lineRows.map((li) => ({
			id: li.id,
			line_key: li.line_key,
			description: li.description,
			details: li.details,
			quantity: li.quantity,
			unit: li.unit,
			unit_price: li.unit_price,
			unit_cost: li.unit_cost,
			taxable: li.taxable,
			source_catalog_item_id: li.source_catalog_item_id,
			total: li.total,
			position: li.position
		})),
		assessment: a
			? {
					id: a.id,
					title: a.title,
					status: a.status,
					scheduled_start: a.scheduled_start?.toISOString() ?? null,
					scheduled_end: a.scheduled_end?.toISOString() ?? null,
					all_day: a.all_day,
					location: a.location,
					notes: a.notes,
					assigned_to: a.assigned_to,
					assignee_ids: a.assignee_ids,
					completed_at: a.completed_at?.toISOString() ?? null,
					completion_notes: a.completion_notes
				}
			: null,
		photos,
		custom_answers: answerRows.map((ans) => ({
			id: ans.id,
			question_label: ans.question_label,
			question_type: ans.question_type,
			value_text: ans.value_text,
			value_json: Array.isArray(ans.value_json)
				? (ans.value_json as unknown[]).filter((v): v is string => typeof v === 'string')
				: null
		}))
	};
}
