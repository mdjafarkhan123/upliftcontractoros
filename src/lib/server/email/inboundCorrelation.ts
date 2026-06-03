import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contacts, conversations, messages, type Conversation } from '$lib/server/db/schema';

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

// Expand a bracket-stripped message-id into the variants we might have stored.
// Brevo returns its messageId wrapped in angle brackets (`<id@host>`) and we
// persist it verbatim, while In-Reply-To/References parse to the bare id — so we
// match against both forms.
function messageIdVariants(id: string): string[] {
	return [id, `<${id}>`];
}

function extractAliasCandidates(toAndCc: ParsedAddress[]): string[] {
	// Org is already known from the receiving domain, and the alias is scoped to
	// that org by a unique index — so we accept any local part matching the alias
	// format regardless of the host it arrived on.
	const out: string[] = [];
	for (const addr of toAndCc) {
		const at = addr.address.indexOf('@');
		if (at <= 0) continue;
		const local = addr.address.slice(0, at);
		if (ALIAS_RE.test(local)) out.push(local);
	}
	return out;
}

/**
 * Resolve an inbound email to (conversation, contact) WITHIN a known org. The
 * org is determined upstream from the receiving domain (canonical routing rule:
 * inbound_domain → org), so correlation only threads to the right conversation.
 * Returns null when nothing matches — caller must log + drop.
 *
 * Priority:
 *   1. reply_alias in any To/Cc local part (org-scoped)
 *   2. In-Reply-To / References → messages.email_provider_message_id (org-scoped)
 *   3. From address matches contacts.email; reuse open conversation or open a new one.
 */
export async function correlateInbound(input: {
	orgId: string;
	from: ParsedAddress | null;
	toAndCc: ParsedAddress[];
	inReplyTo: string | null;
	references: string | null;
}): Promise<CorrelationMatch | null> {
	const { orgId } = input;

	// 1. Reply alias (scoped to org).
	const aliases = extractAliasCandidates(input.toAndCc);
	for (const alias of aliases) {
		const [conv] = await db
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.org_id, orgId),
					eq(conversations.reply_alias, alias),
					isNull(conversations.deleted_at)
				)
			)
			.limit(1);
		if (conv) {
			return {
				orgId,
				conversation: conv,
				contactId: conv.contact_id,
				matchedBy: 'alias',
				createdConversation: false
			};
		}
	}

	// 2. Threading headers (scoped to org).
	const candidateIds = [
		...parseMessageIds(input.inReplyTo),
		...parseMessageIds(input.references)
	].flatMap(messageIdVariants);

	if (candidateIds.length) {
		const [prior] = await db
			.select({ conversation_id: messages.conversation_id })
			.from(messages)
			.where(
				and(
					eq(messages.org_id, orgId),
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
						eq(conversations.org_id, orgId),
						isNull(conversations.deleted_at)
					)
				)
				.limit(1);
			if (conv) {
				return {
					orgId,
					conversation: conv,
					contactId: conv.contact_id,
					matchedBy: 'header',
					createdConversation: false
				};
			}
		}
	}

	// 3. Contact email fallback (scoped to org).
	if (!input.from) return null;
	const fromEmail = input.from.address;

	const [contact] = await db
		.select({ id: contacts.id })
		.from(contacts)
		.where(
			and(eq(contacts.org_id, orgId), eq(contacts.email, fromEmail), isNull(contacts.deleted_at))
		)
		.limit(1);
	if (!contact) return null;

	// Reuse open conversation if any. Conversation creation is left to the
	// processor's tx so the message insert is atomic with conversation creation;
	// here we return a sentinel that the processor handles.
	const [open] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.org_id, orgId),
				eq(conversations.contact_id, contact.id),
				eq(conversations.status, 'open'),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);

	if (open) {
		return {
			orgId,
			conversation: open,
			contactId: contact.id,
			matchedBy: 'contact_fallback',
			createdConversation: false
		};
	}

	// Signal to processor: org + contact known, but no open conversation yet.
	return {
		orgId,
		conversation: null as unknown as Conversation,
		contactId: contact.id,
		matchedBy: 'contact_fallback',
		createdConversation: true
	};
}
