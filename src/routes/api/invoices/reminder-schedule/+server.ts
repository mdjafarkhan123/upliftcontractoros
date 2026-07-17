import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSequences, automationSequenceSteps, organizations } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canViewAnyInvoice } from '$lib/server/invoices/permissions';

// Turn a step's "minutes relative to the due date" into a short human phrase for the
// per-invoice reminder summary. offset_minutes (negative = before due) wins when set;
// otherwise the cumulative delay chain (measured forward from the due date) is used.
function phraseFor(minutesFromDue: number): string {
	if (minutesFromDue === 0) return 'on the due date';
	const abs = Math.abs(minutesFromDue);
	const dir = minutesFromDue < 0 ? 'before due' : 'after due';
	let qty: string;
	if (abs % 1440 === 0) {
		const d = abs / 1440;
		qty = d % 7 === 0 ? `${d / 7} week${d / 7 > 1 ? 's' : ''}` : `${d} day${d > 1 ? 's' : ''}`;
	} else if (abs % 60 === 0) {
		const h = abs / 60;
		qty = `${h} hour${h > 1 ? 's' : ''}`;
	} else {
		qty = `${abs} min`;
	}
	return `${qty} ${dir}`;
}

// Read-only summary of the org's live invoice reminder schedule, used by the invoice
// create + detail screens to show what "automatic payment reminders" will do.
// `enabled` reflects the org gate (plan feature + the sequence's own on/off).
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canViewAnyInvoice(auth.member)) error(403, 'Forbidden');

	const [org] = await db
		.select({ feature_invoice_reminders: organizations.feature_invoice_reminders })
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	const [seq] = await db
		.select({ id: automationSequences.id, enabled: automationSequences.enabled })
		.from(automationSequences)
		.where(
			and(
				eq(automationSequences.org_id, auth.orgId),
				eq(automationSequences.key, 'invoice_dunning')
			)
		)
		.limit(1);

	const enabled = Boolean(org?.feature_invoice_reminders && seq?.enabled);

	let summary = '';
	if (seq) {
		const steps = await db
			.select({
				delay_minutes: automationSequenceSteps.delay_minutes,
				offset_minutes: automationSequenceSteps.offset_minutes
			})
			.from(automationSequenceSteps)
			.where(eq(automationSequenceSteps.sequence_id, seq.id))
			.orderBy(asc(automationSequenceSteps.position));

		let cumulative = 0;
		const phrases: string[] = [];
		for (const s of steps) {
			// Offset steps anchor directly to the due date; delay steps chain forward from
			// the previous step (cumulative), all measured from the due date.
			let minutesFromDue: number;
			if (s.offset_minutes !== null && s.offset_minutes !== undefined) {
				minutesFromDue = s.offset_minutes;
			} else {
				cumulative += s.delay_minutes;
				minutesFromDue = cumulative;
			}
			phrases.push(phraseFor(minutesFromDue));
		}
		summary = phrases.join(' · ');
	}

	return json({ data: { enabled, summary } });
};
