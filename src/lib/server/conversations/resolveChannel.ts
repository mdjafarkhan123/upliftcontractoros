import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	emailDomains,
	messengerContacts,
	webchatSessions,
	type Conversation
} from '$lib/server/db/schema';
import { isReleasedPhone } from '$lib/utils/phone';

export type OutboundChannel = 'sms' | 'email' | 'webchat' | 'messenger';

export type ChannelHints = {
	suggested: OutboundChannel | null;
	available: OutboundChannel[];
};

type ContactLike = {
	phone: string | null;
	email: string | null;
	sms_opt_out: boolean;
};

type ConvLike = Pick<Conversation, 'id' | 'last_message_channel'>;

/**
 * Email is available for an org only when it has a Brevo-verified sending domain
 * (email_domains.status = 'verified'). No shared-platform fallback exists.
 */
export async function isOrgEmailReady(orgId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(and(eq(emailDomains.org_id, orgId), eq(emailDomains.status, 'verified')))
		.limit(1);
	return Boolean(row);
}

/**
 * Messenger is available for a contact once it has a PSID identity on file
 * (created on the first inbound Messenger message). Page-scoped, so keyed by org.
 */
export async function hasMessengerIdentity(orgId: string, contactId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: messengerContacts.id })
		.from(messengerContacts)
		.where(and(eq(messengerContacts.org_id, orgId), eq(messengerContacts.contact_id, contactId)))
		.limit(1);
	return Boolean(row);
}

export async function hasActiveWebchatSession(conversationId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: webchatSessions.id })
		.from(webchatSessions)
		.where(eq(webchatSessions.conversation_id, conversationId))
		.limit(1);
	return Boolean(row);
}

/**
 * Compute which outbound channels are usable for this conversation and which
 * one to default the composer to.
 *
 * Suggested = the most recently used channel that is still viable, falling
 * back to the first available in priority order: webchat → sms → email.
 */
export function computeChannelHints(
	conv: ConvLike,
	contact: ContactLike,
	hasWebchat: boolean,
	emailReady: boolean,
	hasMessenger: boolean
): ChannelHints {
	const available: OutboundChannel[] = [];

	if (hasWebchat) available.push('webchat');
	// Messenger availability is identity-based (a PSID mapping exists). Meta's 24h
	// send window is NOT pre-flighted here — a stale send fails at the worker with
	// an actionable reason (v1 decision).
	if (hasMessenger) available.push('messenger');
	if (contact.phone && !isReleasedPhone(contact.phone) && !contact.sms_opt_out) {
		available.push('sms');
	}
	if (contact.email && emailReady) available.push('email');

	const last = conv.last_message_channel;
	let suggested: OutboundChannel | null;
	if (last === 'webchat' && available.includes('webchat')) suggested = 'webchat';
	else if (last === 'messenger' && available.includes('messenger')) suggested = 'messenger';
	else if (last === 'sms' && available.includes('sms')) suggested = 'sms';
	else if (last === 'email' && available.includes('email')) suggested = 'email';
	else suggested = available[0] ?? null;

	return { suggested, available };
}
