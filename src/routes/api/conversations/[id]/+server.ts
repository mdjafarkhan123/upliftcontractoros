import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import {
	computeChannelHints,
	hasActiveWebchatSession,
	isOrgEmailReady
} from '$lib/server/conversations';
import { getCurrentUsage } from '$lib/server/usage/assertAndIncrementUsage';

function canAccess(
	conv: { assigned_to: string | null },
	member: {
		id: string;
		can_view_all_conversations: boolean;
		can_view_assigned_conversations: boolean;
	}
): boolean {
	if (member.can_view_all_conversations) return true;
	if (member.can_view_assigned_conversations && conv.assigned_to === member.id) return true;
	return false;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id;

	// Single LEFT JOIN LATERAL query — one round trip, nullable sections safe.
	const rows = await db.execute(sql`
		SELECT
			c.id, c.org_id, c.contact_id, c.status, c.subject, c.reply_alias,
			c.assigned_to, c.last_message_at, c.last_message_preview,
			c.last_message_channel, c.last_message_direction,
			c.last_inbound_at, c.last_outbound_at,
			c.last_inbound_email_at, c.last_outbound_email_at,
			c.first_response_at, c.unread_count, c.tags,
			c.snoozed_until, c.snoozed_by,
			c.closed_at, c.closed_by, c.closed_reason,
			c.deleted_at, c.created_at, c.updated_at,
			ct.id            AS ct_id,
			ct.full_name     AS ct_full_name,
			ct.phone         AS ct_phone,
			ct.email         AS ct_email,
			ct.status        AS ct_status,
			ct.sms_opt_out   AS ct_sms_opt_out,
			ct.lead_source   AS ct_lead_source,
			om.full_name     AS assignee_name,
			(EXISTS (
				SELECT 1 FROM messages m
				WHERE m.conversation_id = c.id
					AND m.direction = 'outbound'
					AND m.is_internal_note = false
					AND m.status IN ('failed', 'bounced', 'undeliverable')
			)) AS has_delivery_failure,
			q.id             AS q_id,
			q.quote_number   AS q_quote_number,
			q.status         AS q_status,
			q.total          AS q_total,
			i.id             AS i_id,
			i.invoice_number AS i_invoice_number,
			i.status         AS i_status,
			i.total          AS i_total,
			ps.name          AS pipeline_stage_name,
			a.id             AS a_id,
			a.title          AS a_title,
			a.scheduled_start AS a_scheduled_start,
			a.type           AS a_type
		FROM conversations c
		INNER JOIN contacts ct ON ct.id = c.contact_id
		LEFT JOIN org_members om ON om.id = c.assigned_to
		LEFT JOIN LATERAL (
			SELECT id, quote_number, status, total
			FROM quotes
			WHERE contact_id = c.contact_id
				AND org_id = c.org_id
				AND deleted_at IS NULL
			ORDER BY updated_at DESC
			LIMIT 1
		) q ON TRUE
		LEFT JOIN LATERAL (
			SELECT id, invoice_number, status, total
			FROM invoices
			WHERE contact_id = c.contact_id
				AND org_id = c.org_id
				AND deleted_at IS NULL
			ORDER BY updated_at DESC
			LIMIT 1
		) i ON TRUE
		LEFT JOIN LATERAL (
			SELECT ps.name
			FROM opportunities o
			JOIN pipeline_stages ps ON ps.id = o.stage_id
			WHERE o.contact_id = c.contact_id
				AND o.org_id = c.org_id
				AND o.deleted_at IS NULL
				AND ps.deleted_at IS NULL
			ORDER BY o.updated_at DESC
			LIMIT 1
		) ps ON TRUE
		LEFT JOIN LATERAL (
			SELECT id, title, scheduled_start, type
			FROM appointments
			WHERE contact_id = c.contact_id
				AND org_id = c.org_id
				AND status = 'scheduled'
				AND scheduled_start > NOW()
				AND deleted_at IS NULL
			ORDER BY scheduled_start ASC
			LIMIT 1
		) a ON TRUE
		WHERE c.id = ${id}
			AND c.org_id = ${auth.orgId}
			AND c.deleted_at IS NULL
		LIMIT 1
	`);

	const row =
		(rows as unknown as { rows?: Record<string, unknown>[] }).rows?.[0] ??
		(Array.isArray(rows) ? (rows as Record<string, unknown>[])[0] : undefined);

	if (!row) error(404, 'Conversation not found');

	const assignedTo = row.assigned_to as string | null;
	if (!canAccess({ assigned_to: assignedTo }, auth.member)) error(403, 'Forbidden');

	const conversation = {
		id: row.id as string,
		org_id: row.org_id as string,
		contact_id: row.contact_id as string,
		status: row.status as string,
		subject: row.subject as string | null,
		reply_alias: row.reply_alias as string | null,
		assigned_to: assignedTo,
		last_message_at: row.last_message_at as string | null,
		last_message_preview: row.last_message_preview as string | null,
		last_message_channel: row.last_message_channel as string | null,
		last_message_direction: row.last_message_direction as string | null,
		last_inbound_at: row.last_inbound_at as string | null,
		last_outbound_at: row.last_outbound_at as string | null,
		last_inbound_email_at: row.last_inbound_email_at as string | null,
		last_outbound_email_at: row.last_outbound_email_at as string | null,
		first_response_at: row.first_response_at as string | null,
		unread_count: Number(row.unread_count ?? 0),
		tags: (row.tags as string[] | null) ?? [],
		snoozed_until: row.snoozed_until as string | null,
		snoozed_by: row.snoozed_by as string | null,
		closed_at: row.closed_at as string | null,
		closed_by: row.closed_by as string | null,
		closed_reason: row.closed_reason as string | null,
		created_at: row.created_at as string,
		updated_at: row.updated_at as string
	};

	const contact = {
		id: row.ct_id as string,
		full_name: row.ct_full_name as string,
		phone: row.ct_phone as string,
		email: row.ct_email as string | null,
		status: row.ct_status as string,
		sms_opt_out: Boolean(row.ct_sms_opt_out),
		lead_source: row.ct_lead_source as string | null
	};

	// Selective unread self-heal (P2-D Part 2): only if the row has unread or
	// was recently updated — skip cold threads to avoid unnecessary load.
	const updatedAtTs = new Date(conversation.updated_at).getTime();
	const shouldSelfHeal = conversation.unread_count > 0 || Date.now() - updatedAtTs < 5 * 60 * 1000;
	if (shouldSelfHeal) {
		await db.execute(sql`
			WITH actual AS (
				SELECT COUNT(*)::int AS cnt
				FROM messages
				WHERE conversation_id = ${id}
					AND direction = 'inbound'
					AND read_at IS NULL
			)
			UPDATE conversations
			SET unread_count = actual.cnt
			FROM actual
			WHERE conversations.id = ${id}
				AND conversations.unread_count <> actual.cnt
		`);
	}

	const hasWebchat = await hasActiveWebchatSession(conversation.id);
	const emailReady = await isOrgEmailReady(conversation.org_id);
	const channelHints = computeChannelHints(
		{
			id: conversation.id,
			last_message_channel: conversation.last_message_channel as
				| 'sms'
				| 'email'
				| 'webchat'
				| 'missed_call'
				| null
		},
		{ phone: contact.phone, email: contact.email, sms_opt_out: contact.sms_opt_out },
		hasWebchat,
		emailReady
	);

	// SMS quota for composer gating (P0-A)
	const smsUsed = await getCurrentUsage(db, auth.orgId, 'sms_sent');
	const smsLimit = auth.limits.max_monthly_sms;

	const latestQuote = row.q_id
		? {
				id: row.q_id as string,
				quote_number: Number(row.q_quote_number),
				status: row.q_status as string,
				total: String(row.q_total)
			}
		: null;
	const latestInvoice = row.i_id
		? {
				id: row.i_id as string,
				invoice_number: Number(row.i_invoice_number),
				status: row.i_status as string,
				total: String(row.i_total)
			}
		: null;
	const nextAppointment = row.a_id
		? {
				id: row.a_id as string,
				title: row.a_title as string | null,
				scheduled_start: row.a_scheduled_start as string,
				type: row.a_type as string
			}
		: null;

	return json({
		data: {
			conversation: {
				...conversation,
				assignee_name: row.assignee_name as string | null,
				has_delivery_failure: Boolean(row.has_delivery_failure),
				suggested_channel: channelHints.suggested,
				available_channels: channelHints.available
			},
			contact,
			context: {
				pipeline_stage: (row.pipeline_stage_name as string | null) ?? null,
				latest_quote: latestQuote,
				latest_invoice: latestInvoice,
				next_appointment: nextAppointment,
				sms_quota: { used: smsUsed, limit: smsLimit }
			}
		}
	});
};
