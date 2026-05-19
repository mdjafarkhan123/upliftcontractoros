import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	messages,
	organizations,
	type Conversation
} from '$lib/server/db/schema';

const env = process.env;
const ALIAS_RE = /^r_[a-z0-9]{12}$/;

export type CorrelationMatch = {
	orgId: string;
	conversation: Conversation;
	contactId: string;
	matchedBy: 'alias' | 'header' | 'contact_fallback';
	createdConversation: boolean;
};

export type ParsedAddress = { name: string | null; address: string };

/**
 * Extract `local@domain` pairs from a raw RFC2822 header value like
 *   `"Acme" <hello@acme.com>, ops@acme.com`.
 * Tolerant of surrounding whitespace and missing display name.
 */
export function parseAddresses(raw: string | null | undefined): ParsedAddress[] {
	if (!raw) return [];
	const out: ParsedAddress[] = [];
	for (const part of raw.split(',')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const bracket = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
		if (bracket) {
			out.push({
				name: bracket[1]?.trim() || null,
				address: bracket[2].trim().toLowerCase()
			});
		} else if (/@/.test(trimmed)) {
			out.push({ name: null, address: trimmed.toLowerCase() });
		}
	}
	return out;
}

/** Extract `<id@host>` style message IDs from a header value. */
export function parseMessageIds(raw: string | null | undefined): string[] {
	if (!raw) return [];
	return Array.from(raw.matchAll(/<([^<>\s]+)>/g)).map((m) => m[1]);
}

/**
 * From a message-id like `<abc@resend.dev>` extract just the local part.
 * Resend assigns its provider message id as the SMTP Message-ID local part,
 * so we can match it back against messages.email_provider_message_id.
 */
export function messageIdLocalPart(id: string): string {
	const at = id.indexOf('@');
	return at === -1 ? id : id.slice(0, at);
}

function extractAliasCandidates(toAndCc: ParsedAddress[]): string[] {
	const domain = env.EMAIL_REPLY_DOMAIN?.toLowerCase() ?? null;
	const out: string[] = [];
	for (const addr of toAndCc) {
		const at = addr.address.indexOf('@');
		if (at <= 0) continue;
		const local = addr.address.slice(0, at);
		const host = addr.address.slice(at + 1);
		if (domain && host !== domain) continue;
		if (ALIAS_RE.test(local)) out.push(local);
	}
	return out;
}

/**
 * Resolve an inbound email to (org, conversation, contact) using the documented
 * priority order. Returns null when nothing matches — caller must log + drop.
 *
 * Priority:
 *   1. reply_alias in any To/Cc local part on EMAIL_REPLY_DOMAIN
 *   2. In-Reply-To / References → messages.email_provider_message_id (then org-scoped contact match)
 *   3. From address matches contacts.email; reuse open conversation or open a new one.
 */
export async function correlateInbound(input: {
	from: ParsedAddress | null;
	toAndCc: ParsedAddress[];
	inReplyTo: string | null;
	references: string | null;
}): Promise<CorrelationMatch | null> {
	// 1. Reply alias
	const aliases = extractAliasCandidates(input.toAndCc);
	for (const alias of aliases) {
		const [conv] = await db
			.select()
			.from(conversations)
			.where(and(eq(conversations.reply_alias, alias), isNull(conversations.deleted_at)))
			.limit(1);
		if (conv) {
			return {
				orgId: conv.org_id,
				conversation: conv,
				contactId: conv.contact_id,
				matchedBy: 'alias',
				createdConversation: false
			};
		}
	}

	// 2. Threading headers
	const candidateIds = [
		...parseMessageIds(input.inReplyTo),
		...parseMessageIds(input.references)
	].map(messageIdLocalPart);

	if (candidateIds.length) {
		const [prior] = await db
			.select({
				org_id: messages.org_id,
				conversation_id: messages.conversation_id
			})
			.from(messages)
			.where(
				and(
					eq(messages.channel, 'email'),
					inArray(messages.email_provider_message_id, candidateIds)
				)
			)
			.orderBy(desc(messages.created_at))
			.limit(1);

		if (prior) {
			const [conv] = await db
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.id, prior.conversation_id),
						eq(conversations.org_id, prior.org_id),
						isNull(conversations.deleted_at)
					)
				)
				.limit(1);
			if (conv) {
				return {
					orgId: conv.org_id,
					conversation: conv,
					contactId: conv.contact_id,
					matchedBy: 'header',
					createdConversation: false
				};
			}
		}
	}

	// 3. Contact email fallback — only when we can also identify the org. We
	// identify the org via the recipient: any To/Cc address whose local part is
	// an org `email_sender_local` on a Resend-verified sending domain. If we
	// cannot resolve the org, we cannot create rows safely.
	if (!input.from) return null;
	const fromEmail = input.from.address;

	const candidateLocals = input.toAndCc.map((a) => {
		const at = a.address.indexOf('@');
		return at > 0 ? a.address.slice(0, at) : null;
	}).filter((v): v is string => !!v);

	if (!candidateLocals.length) return null;

	const candidateOrgs = await db
		.select()
		.from(organizations)
		.where(inArray(organizations.email_sender_local, candidateLocals));

	for (const org of candidateOrgs) {
		const [contact] = await db
			.select()
			.from(contacts)
			.where(
				and(
					eq(contacts.org_id, org.id),
					eq(contacts.email, fromEmail),
					isNull(contacts.deleted_at)
				)
			)
			.limit(1);
		if (!contact) continue;

		// Reuse open conversation if any. Conversation creation is left to the
		// processor's tx so the message insert is atomic with conversation
		// creation; here we return a sentinel that the processor handles.
		const [open] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.org_id, org.id),
					eq(conversations.contact_id, contact.id),
					eq(conversations.status, 'open'),
					isNull(conversations.deleted_at)
				)
			)
			.limit(1);

		if (open) {
			return {
				orgId: org.id,
				conversation: open,
				contactId: contact.id,
				matchedBy: 'contact_fallback',
				createdConversation: false
			};
		}

		// Signal to processor: org + contact known, but no open conversation yet.
		return {
			orgId: org.id,
			conversation: null as unknown as Conversation,
			contactId: contact.id,
			matchedBy: 'contact_fallback',
			createdConversation: true
		};
	}

	return null;
}
