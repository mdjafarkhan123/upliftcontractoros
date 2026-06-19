import { json, error } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSequences, automationSequenceSteps } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { AUTOMATION_CARD_KEYS } from '$lib/automation/cardDefinitions';

// Read every engine-backed automation sequence + its ordered steps for the org.
// These drive the card editor in Settings → Automation (Stage 3.d.1). The flat
// `automation_settings` row is still read separately for the non-engine cards
// (booking confirmation, payment receipt, review funnel).

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const sequences = await db
		.select({
			id: automationSequences.id,
			key: automationSequences.key,
			enabled: automationSequences.enabled,
			channel: automationSequences.channel,
			// text-cast so microsecond precision survives the round-trip for the
			// optimistic-concurrency check (JS Date truncates to ms).
			updated_at: sql<string>`${automationSequences.updated_at}::text`.as('updated_at')
		})
		.from(automationSequences)
		.where(
			and(
				eq(automationSequences.org_id, auth.orgId),
				inArray(automationSequences.key, [...AUTOMATION_CARD_KEYS])
			)
		);

	const ids = sequences.map((s) => s.id);
	const steps = ids.length
		? await db
				.select({
					sequence_id: automationSequenceSteps.sequence_id,
					position: automationSequenceSteps.position,
					delay_minutes: automationSequenceSteps.delay_minutes,
					offset_minutes: automationSequenceSteps.offset_minutes,
					channel: automationSequenceSteps.channel,
					audience: automationSequenceSteps.audience,
					condition: automationSequenceSteps.condition,
					sms_body: automationSequenceSteps.sms_body,
					email_subject: automationSequenceSteps.email_subject,
					email_body: automationSequenceSteps.email_body
				})
				.from(automationSequenceSteps)
				.where(inArray(automationSequenceSteps.sequence_id, ids))
				.orderBy(asc(automationSequenceSteps.position))
		: [];

	const stepsBySequence = new Map<string, typeof steps>();
	for (const s of steps) {
		const list = stepsBySequence.get(s.sequence_id) ?? [];
		list.push(s);
		stepsBySequence.set(s.sequence_id, list);
	}

	const data = sequences.map((seq) => ({
		key: seq.key,
		enabled: seq.enabled,
		channel: seq.channel,
		updated_at: seq.updated_at,
		steps: (stepsBySequence.get(seq.id) ?? []).map((s) => ({
			position: s.position,
			delay_minutes: s.delay_minutes,
			offset_minutes: s.offset_minutes,
			channel: s.channel,
			audience: s.audience,
			condition: s.condition,
			sms_body: s.sms_body,
			email_subject: s.email_subject,
			email_body: s.email_body
		}))
	}));

	return json({ data: { sequences: data } });
};
