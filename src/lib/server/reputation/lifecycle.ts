import { and, eq, isNull, sql } from 'drizzle-orm';
import {
	outboxEvents,
	privateFeedback,
	reviewEvents,
	reviewRequests,
	type ReviewEventType,
	type ReviewRequest
} from '$lib/server/db/schema';
import type { db as dbClient } from '$lib/server/db/client';
import { findOrCreateOpenConversation } from '$lib/server/conversations/findOrCreateOpenConversation';
import { recordOutboundMessage } from '$lib/server/conversations/recordOutboundMessage';

const STAR_GLYPH = '★';

async function writeInternalConversationNote(
	tx: Tx,
	params: { orgId: string; contactId: string; body: string }
): Promise<void> {
	const { conversation } = await findOrCreateOpenConversation(tx, {
		orgId: params.orgId,
		contactId: params.contactId,
		createdChannel: 'sms'
	});
	await recordOutboundMessage(tx, {
		orgId: params.orgId,
		conversationId: conversation.id,
		channel: 'sms',
		body: params.body,
		sentBy: null,
		status: 'sent',
		isInternalNote: true,
		source: 'reputation.lifecycle'
	});
}

// Drizzle transaction shape. Use `Parameters<...>` so this file does not have
// to import the internal NodePgTransaction type.
type Tx = Parameters<Parameters<typeof dbClient.transaction>[0]>[0];

export type EmitReviewEventInput = {
	org_id: string;
	review_request_id: string;
	type: ReviewEventType;
	rating?: number | null;
	nudge_number?: number | null;
	confidence_score?: number | null;
	meta?: Record<string, unknown>;
};

/**
 * Append-only funnel event. Always insert via this helper so we never write
 * `review_events` rows with the wrong shape.
 */
export async function emitReviewEvent(tx: Tx, input: EmitReviewEventInput): Promise<void> {
	await tx.insert(reviewEvents).values({
		org_id: input.org_id,
		review_request_id: input.review_request_id,
		type: input.type,
		rating: input.rating ?? null,
		nudge_number: input.nudge_number ?? null,
		confidence_score: input.confidence_score?.toFixed(2) ?? null,
		meta: input.meta ?? {}
	});
}

export type TransitionResult =
	| { kind: 'transitioned'; request: ReviewRequest }
	| { kind: 'already_terminal' }
	| { kind: 'not_found' };

/**
 * Transition `sent → engaged`. Idempotent under retries thanks to the
 * `status = 'sent' AND submitted_rating IS NULL` row guard: a second call for
 * the same request flips zero rows and returns `already_terminal`.
 *
 * Emits `rating_submitted` and schedules nudge jobs via outbox
 * (`review_request.engaged`). Caller is responsible for the response (e.g.
 * redirect URL).
 */
export async function transitionToEngaged(
	tx: Tx,
	requestId: string,
	rating: number
): Promise<TransitionResult> {
	if (!Number.isInteger(rating) || rating < 4 || rating > 5) {
		throw new Error(`transitionToEngaged: rating must be 4 or 5, got ${rating}`);
	}

	const now = new Date();

	const updated = await tx
		.update(reviewRequests)
		.set({
			status: 'engaged',
			submitted_rating: rating,
			engaged_at: now,
			redirected_to_google_at: now,
			updated_at: now
		})
		.where(
			and(
				eq(reviewRequests.id, requestId),
				eq(reviewRequests.status, 'sent'),
				isNull(reviewRequests.submitted_rating),
				isNull(reviewRequests.deleted_at)
			)
		)
		.returning();

	if (updated.length === 0) {
		const [existing] = await tx
			.select()
			.from(reviewRequests)
			.where(eq(reviewRequests.id, requestId))
			.limit(1);
		if (!existing) return { kind: 'not_found' };
		return { kind: 'already_terminal' };
	}

	const request = updated[0];

	await emitReviewEvent(tx, {
		org_id: request.org_id,
		review_request_id: request.id,
		type: 'rating_submitted',
		rating
	});

	await emitReviewEvent(tx, {
		org_id: request.org_id,
		review_request_id: request.id,
		type: 'redirected_to_google'
	});

	await writeInternalConversationNote(tx, {
		orgId: request.org_id,
		contactId: request.contact_id,
		body: `Customer rated ${rating}${STAR_GLYPH} via review link`
	});

	await writeInternalConversationNote(tx, {
		orgId: request.org_id,
		contactId: request.contact_id,
		body: 'Customer was redirected to Google review'
	});

	await tx.insert(outboxEvents).values({
		org_id: request.org_id,
		event_type: 'review_request.engaged',
		resource_type: 'review_request',
		resource_id: request.id,
		payload: {
			review_request_id: request.id,
			contact_id: request.contact_id,
			job_id: request.job_id,
			engaged_at: now.toISOString(),
			rating
		},
		idempotency_key: `review_request.engaged:${request.id}`
	});

	return { kind: 'transitioned', request };
}

/**
 * Transition `sent → completed_internal`. Inserts a `private_feedback` row
 * and emits `private_feedback.received` (so existing notification routing
 * still fires). Terminal — no further automation.
 */
export async function transitionToCompletedInternal(
	tx: Tx,
	requestId: string,
	rating: number,
	body: string | null
): Promise<TransitionResult> {
	if (!Number.isInteger(rating) || rating < 1 || rating > 3) {
		throw new Error(`transitionToCompletedInternal: rating must be 1..3, got ${rating}`);
	}

	const now = new Date();

	const updated = await tx
		.update(reviewRequests)
		.set({
			status: 'completed_internal',
			submitted_rating: rating,
			completed_at: now,
			updated_at: now
		})
		.where(
			and(
				eq(reviewRequests.id, requestId),
				eq(reviewRequests.status, 'sent'),
				isNull(reviewRequests.submitted_rating),
				isNull(reviewRequests.deleted_at)
			)
		)
		.returning();

	if (updated.length === 0) {
		const [existing] = await tx
			.select()
			.from(reviewRequests)
			.where(eq(reviewRequests.id, requestId))
			.limit(1);
		if (!existing) return { kind: 'not_found' };
		return { kind: 'already_terminal' };
	}

	const request = updated[0];

	await emitReviewEvent(tx, {
		org_id: request.org_id,
		review_request_id: request.id,
		type: 'rating_submitted',
		rating
	});

	const trimmed = (body ?? '').trim().slice(0, 2000) || null;

	const [insertedFeedback] = await tx
		.insert(privateFeedback)
		.values({
			org_id: request.org_id,
			job_id: request.job_id,
			contact_id: request.contact_id,
			review_request_id: request.id,
			score: rating,
			body: trimmed
		})
		.returning();

	const noteLines = [`Customer rated ${rating}${STAR_GLYPH} — left internal feedback`];
	if (trimmed) noteLines.push(trimmed);
	await writeInternalConversationNote(tx, {
		orgId: request.org_id,
		contactId: request.contact_id,
		body: noteLines.join('\n\n')
	});

	await tx.insert(outboxEvents).values({
		org_id: request.org_id,
		event_type: 'private_feedback.received',
		resource_type: 'private_feedback',
		resource_id: insertedFeedback.id,
		payload: {
			private_feedback_id: insertedFeedback.id,
			org_id: request.org_id,
			job_id: request.job_id,
			contact_id: request.contact_id,
			review_request_id: request.id,
			score: rating
		},
		idempotency_key: `private_feedback.received:${request.id}`
	});

	return { kind: 'transitioned', request };
}

/**
 * Flip a still-active row to `expired`. Skips if the row already reached
 * any terminal state. Called from the `review.expire` worker handler.
 */
export async function transitionToExpired(tx: Tx, requestId: string): Promise<boolean> {
	const now = new Date();
	const updated = await tx
		.update(reviewRequests)
		.set({ status: 'expired', expired_at: now, updated_at: now })
		.where(
			and(
				eq(reviewRequests.id, requestId),
				sql`${reviewRequests.status} IN ('sent', 'engaged')`,
				isNull(reviewRequests.deleted_at)
			)
		)
		.returning({ id: reviewRequests.id });

	if (updated.length === 0) return false;

	const [row] = await tx
		.select({ org_id: reviewRequests.org_id })
		.from(reviewRequests)
		.where(eq(reviewRequests.id, requestId))
		.limit(1);
	if (!row) return false;

	await emitReviewEvent(tx, {
		org_id: row.org_id,
		review_request_id: requestId,
		type: 'expired'
	});
	return true;
}
