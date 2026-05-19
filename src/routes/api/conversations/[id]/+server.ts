import { json, error } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	invoices,
	messages,
	opportunities,
	orgMembers,
	pipelineStages,
	quotes
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { computeChannelHints, hasActiveWebchatSession } from '$lib/server/conversations';

function canAccess(
	conv: { assigned_to: string | null },
	member: { id: string; can_view_all_conversations: boolean; can_view_assigned_conversations: boolean }
): boolean {
	if (member.can_view_all_conversations) return true;
	if (member.can_view_assigned_conversations && conv.assigned_to === member.id) return true;
	return false;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	const id = event.params.id;
	const hasDeliveryFailureExpr = sql<boolean>`EXISTS (
		SELECT 1 FROM ${messages} m
		WHERE m.conversation_id = ${conversations.id}
			AND m.direction = 'outbound'
			AND m.is_internal_note = false
			AND m.status IN ('failed', 'bounced', 'undeliverable')
	)`;

	const [row] = await db
		.select({
			conversation: conversations,
			contact: contacts,
			assignee_name: orgMembers.full_name,
			has_delivery_failure: hasDeliveryFailureExpr
		})
		.from(conversations)
		.innerJoin(contacts, eq(contacts.id, conversations.contact_id))
		.leftJoin(orgMembers, eq(orgMembers.id, conversations.assigned_to))
		.where(
			and(
				eq(conversations.id, id),
				eq(conversations.org_id, auth.orgId),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);

	if (!row) error(404, 'Conversation not found');
	if (!canAccess(row.conversation, auth.member)) error(403, 'Forbidden');

	const contactId = row.contact.id;

	const [latestOpp] = await db
		.select({
			id: opportunities.id,
			stage_name: pipelineStages.name
		})
		.from(opportunities)
		.leftJoin(pipelineStages, eq(pipelineStages.id, opportunities.stage_id))
		.where(
			and(
				eq(opportunities.contact_id, contactId),
				eq(opportunities.org_id, auth.orgId),
				isNull(opportunities.deleted_at)
			)
		)
		.orderBy(desc(opportunities.updated_at))
		.limit(1);

	const [latestQuote] = await db
		.select({
			id: quotes.id,
			quote_number: quotes.quote_number,
			status: quotes.status,
			total: quotes.total
		})
		.from(quotes)
		.where(
			and(
				eq(quotes.contact_id, contactId),
				eq(quotes.org_id, auth.orgId),
				isNull(quotes.deleted_at)
			)
		)
		.orderBy(desc(quotes.updated_at))
		.limit(1);

	const [latestInvoice] = await db
		.select({
			id: invoices.id,
			invoice_number: invoices.invoice_number,
			status: invoices.status,
			total: invoices.total
		})
		.from(invoices)
		.where(
			and(
				eq(invoices.contact_id, contactId),
				eq(invoices.org_id, auth.orgId),
				isNull(invoices.deleted_at)
			)
		)
		.orderBy(desc(invoices.updated_at))
		.limit(1);

	const hasWebchat = await hasActiveWebchatSession(row.conversation.id);
	const channelHints = computeChannelHints(row.conversation, row.contact, hasWebchat);

	return json({
		data: {
			conversation: {
				...row.conversation,
				assignee_name: row.assignee_name,
				has_delivery_failure: row.has_delivery_failure,
				suggested_channel: channelHints.suggested,
				available_channels: channelHints.available
			},
			contact: row.contact,
			context: {
				pipeline_stage: latestOpp?.stage_name ?? null,
				latest_quote: latestQuote ?? null,
				latest_invoice: latestInvoice ?? null
			}
		}
	});
};
