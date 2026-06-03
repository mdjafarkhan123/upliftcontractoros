import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	automationSettings,
	contacts,
	organizations,
	reviewRequests,
	type Contact,
	type Organization,
	type ReviewRequest
} from '$lib/server/db/schema';
import {
	emitReviewEvent,
	transitionToCompletedInternal,
	transitionToEngaged
} from '$lib/server/reputation/lifecycle';

type Loaded = {
	request: ReviewRequest;
	contact: Contact;
	org: Organization;
	google_review_link: string | null;
};

async function loadByToken(token: string): Promise<Loaded | null> {
	const [request] = await db
		.select()
		.from(reviewRequests)
		.where(and(eq(reviewRequests.token, token), isNull(reviewRequests.deleted_at)))
		.limit(1);
	if (!request) return null;

	const [contact] = await db
		.select()
		.from(contacts)
		.where(eq(contacts.id, request.contact_id))
		.limit(1);
	if (!contact) return null;

	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.id, request.org_id))
		.limit(1);
	if (!org) return null;

	const [settings] = await db
		.select({ google_review_link: automationSettings.google_review_link })
		.from(automationSettings)
		.where(eq(automationSettings.org_id, request.org_id))
		.limit(1);

	return {
		request,
		contact,
		org,
		google_review_link: settings?.google_review_link?.trim() || null
	};
}

function firstNameOf(contact: Contact): string {
	return contact.full_name.split(/\s+/)[0] ?? contact.full_name;
}

function isTokenShape(token: string): boolean {
	return /^[A-Za-z0-9]{8,32}$/.test(token);
}

function readScore(payload: unknown): number | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const raw = (payload as Record<string, unknown>).score;
	const n = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 5) return null;
	return n;
}

function readBody(payload: unknown): string | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const raw = (payload as Record<string, unknown>).body;
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	return trimmed.length === 0 ? null : trimmed.slice(0, 2000);
}

// Already-submitted semantics: `engaged` and `likely_reviewed` mean rating ≥ 4
// (positive funnel — surface the Google link on revisit). `completed_internal`
// means rating ≤ 3 (no link). `expired` is its own state.
function classify(
	request: ReviewRequest
): 'ready' | 'engaged_positive' | 'completed_internal' | 'expired' {
	if (request.status === 'sent') {
		if (request.token_expires_at && request.token_expires_at.getTime() < Date.now()) {
			return 'expired';
		}
		return 'ready';
	}
	if (request.status === 'engaged' || request.status === 'likely_reviewed') {
		return 'engaged_positive';
	}
	if (request.status === 'completed_internal') return 'completed_internal';
	return 'expired';
}

export const GET: RequestHandler = async ({ params }) => {
	const token = params.token ?? '';
	if (!isTokenShape(token)) return json({ error: 'Invalid link.' }, { status: 404 });

	const loaded = await loadByToken(token);
	if (!loaded) return json({ error: 'Invalid link.' }, { status: 404 });

	// Pure telemetry: emit link_opened on every valid GET. No status change,
	// no nudge/reminder impact, no attribution role.
	await db.transaction(async (tx) => {
		await emitReviewEvent(tx, {
			org_id: loaded.request.org_id,
			review_request_id: loaded.request.id,
			type: 'link_opened'
		});
	});

	const cls = classify(loaded.request);
	const firstName = firstNameOf(loaded.contact);

	if (cls === 'expired') return json({ data: { state: 'expired' } });

	if (cls === 'engaged_positive') {
		return json({
			data: {
				state: 'already_submitted',
				org_name: loaded.org.name,
				contact_first_name: firstName,
				submitted_score: loaded.request.submitted_rating,
				google_review_link: loaded.google_review_link
			}
		});
	}

	if (cls === 'completed_internal') {
		return json({
			data: {
				state: 'already_submitted',
				org_name: loaded.org.name,
				contact_first_name: firstName,
				submitted_score: loaded.request.submitted_rating,
				google_review_link: null
			}
		});
	}

	return json({
		data: {
			state: 'ready',
			org_name: loaded.org.name,
			contact_first_name: firstName
		}
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const token = params.token ?? '';
	if (!isTokenShape(token)) return json({ error: 'Invalid link.' }, { status: 404 });

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid request.' }, { status: 400 });
	}
	const score = readScore(payload);
	const body = readBody(payload);
	if (score === null) {
		return json({ error: 'Score must be an integer between 1 and 5.' }, { status: 400 });
	}

	const loaded = await loadByToken(token);
	if (!loaded) return json({ error: 'Invalid link.' }, { status: 404 });

	const cls = classify(loaded.request);
	if (cls === 'expired') return json({ error: 'This link has expired.' }, { status: 410 });

	if (cls === 'engaged_positive') {
		return json({
			data: {
				state: 'already_submitted',
				submitted_score: loaded.request.submitted_rating,
				google_review_link: loaded.google_review_link
			}
		});
	}
	if (cls === 'completed_internal') {
		return json({
			data: {
				state: 'already_submitted',
				submitted_score: loaded.request.submitted_rating,
				google_review_link: null
			}
		});
	}

	const outcome = await db.transaction(async (tx) => {
		if (score >= 4) {
			const result = await transitionToEngaged(tx, loaded.request.id, score);
			return {
				kind: result.kind,
				score,
				path: 'review' as const,
				google_review_link: loaded.google_review_link
			};
		}
		const result = await transitionToCompletedInternal(tx, loaded.request.id, score, body);
		return {
			kind: result.kind,
			score,
			path: 'feedback' as const,
			google_review_link: null as string | null
		};
	});

	if (outcome.kind === 'not_found') {
		return json({ error: 'Invalid link.' }, { status: 404 });
	}
	if (outcome.kind === 'already_terminal') {
		// Lost the race: another tab / retry beat us to it. Return the
		// canonical "already_submitted" shape using the now-current row.
		const reloaded = await loadByToken(token);
		const link =
			reloaded && reloaded.request.status !== 'completed_internal'
				? reloaded.google_review_link
				: null;
		return json({
			data: {
				state: 'already_submitted',
				submitted_score: reloaded?.request.submitted_rating ?? score,
				google_review_link: link
			}
		});
	}

	return json({
		data: {
			state: 'recorded',
			score: outcome.score,
			path: outcome.path,
			google_review_link: outcome.google_review_link
		}
	});
};
