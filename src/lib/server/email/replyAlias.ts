import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { conversations, type Conversation } from '$lib/server/db/schema';
import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ALIAS_LEN = 12;
const ALIAS_PREFIX = 'r_';
const MAX_ATTEMPTS = 5;

function generateAlias(): string {
	const bytes = randomBytes(ALIAS_LEN);
	let out = ALIAS_PREFIX;
	for (let i = 0; i < ALIAS_LEN; i += 1) {
		out += ALPHABET[bytes[i] % ALPHABET.length];
	}
	return out;
}

/**
 * Ensure a conversation has a reply_alias. Returns the alias.
 *
 * Generation is opaque (no embedded IDs). Uniqueness is enforced by the
 * (org_id, reply_alias) partial unique index — on collision we regenerate.
 *
 * Idempotent: if the conversation already has an alias, returns it without
 * generating a new one.
 */
export async function ensureReplyAlias(orgId: string, conversationId: string): Promise<string> {
	const [existing] = await db
		.select({ reply_alias: conversations.reply_alias })
		.from(conversations)
		.where(
			and(
				eq(conversations.id, conversationId),
				eq(conversations.org_id, orgId),
				isNull(conversations.deleted_at)
			)
		)
		.limit(1);

	if (existing?.reply_alias) return existing.reply_alias;

	let lastErr: unknown = null;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const candidate = generateAlias();
		try {
			const [updated] = await db
				.update(conversations)
				.set({ reply_alias: candidate, updated_at: new Date() })
				.where(
					and(
						eq(conversations.id, conversationId),
						eq(conversations.org_id, orgId),
						isNull(conversations.reply_alias)
					)
				)
				.returning({ reply_alias: conversations.reply_alias });
			if (updated?.reply_alias) return updated.reply_alias;
			// No row returned → either alias was set concurrently OR conversation gone.
			// Re-read to differentiate.
			const [recheck] = await db
				.select({ reply_alias: conversations.reply_alias })
				.from(conversations)
				.where(eq(conversations.id, conversationId))
				.limit(1);
			if (recheck?.reply_alias) return recheck.reply_alias;
			throw new Error('Conversation not found while setting reply alias');
		} catch (err) {
			lastErr = err;
			const msg = err instanceof Error ? err.message : String(err);
			if (!/unique|duplicate/i.test(msg)) throw err;
		}
	}
	throw lastErr instanceof Error
		? lastErr
		: new Error('Failed to allocate reply alias after retries');
}

/**
 * Lookup a conversation by reply alias scoped to org. Returns null if no match.
 */
export async function findConversationByAlias(
	orgId: string,
	alias: string
): Promise<Conversation | null> {
	const [row] = await db
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
	return row ?? null;
}
