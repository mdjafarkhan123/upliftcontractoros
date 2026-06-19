import { eq } from 'drizzle-orm';
import { db } from '../client';
import { automationSequences, automationSequenceSteps, automationSettings } from '../schema';

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type DbOrTx = Db | Tx;

type StepChannel = 'sms_first' | 'email_first' | 'both' | 'sms_only' | 'email_only';

// Default follow-up steps for the speed_to_lead card (PLAN.md Card 1). Step 0 is
// seeded from the org's automation_settings.speed_to_lead_* fields; these are the
// follow-ups. MUST stay in sync with migration 0087's seed so orgs created before
// and after the engine shipped get identical defaults. Editable in the 3.d UI.
const SPEED_TO_LEAD_FOLLOWUPS: Array<{
	position: number;
	delay_minutes: number;
	channel: StepChannel;
	sms_body: string;
	email_subject: string;
	email_body: string;
}> = [
	{
		position: 1,
		delay_minutes: 60,
		channel: 'sms_first',
		sms_body: "Still there {contact_name}? Reply YES and we'll call you right back.",
		email_subject: 'Following up on your request',
		email_body:
			"Hi {contact_name},\n\nJust checking in on your request — we'd love to help. Reply here or call us and we'll get right back to you.\n\n- {org_name}"
	},
	{
		position: 2,
		delay_minutes: 240,
		channel: 'sms_first',
		sms_body:
			"Hi {contact_name}, here's how we can help with your project. When works for a quick call?",
		email_subject: 'How we can help',
		email_body:
			"Hi {contact_name},\n\nWe wanted to follow up and see how we can help. Just reply with a good time and we'll reach out.\n\n- {org_name}"
	},
	{
		position: 3,
		delay_minutes: 1440,
		channel: 'email_first',
		sms_body:
			"Last follow-up {contact_name} — are you still interested? We're here whenever you're ready.",
		email_subject: 'Checking in one last time',
		email_body:
			"Hi {contact_name},\n\nThis is our last note for now — if you're still interested we'd be glad to help. Reply anytime and we'll pick things right back up.\n\n- {org_name}"
	}
];

// Default follow-up steps for the missed_call card (PLAN.md Card 2). SMS-only by
// design (they called, you text back). Step 0 is seeded from the org's
// missed_call_textback_message. Editable in the 3.d UI.
const MISSED_CALL_FOLLOWUPS: Array<{
	position: number;
	delay_minutes: number;
	channel: StepChannel;
	sms_body: string;
}> = [
	{
		position: 1,
		delay_minutes: 120,
		sms_body:
			"Hi {contact_name}, we tried reaching you earlier. Still need a hand? Reply here and we'll help right away."
	},
	{
		position: 2,
		delay_minutes: 1440,
		sms_body:
			"Hi {contact_name}, following up one more time from {org_name} — happy to help whenever you're ready. Just reply here."
	}
].map((s) => ({ ...s, channel: 'sms_only' as StepChannel }));

function speedToLeadChannel(channel: string): StepChannel {
	switch (channel) {
		case 'sms':
			return 'sms_only';
		case 'email':
			return 'email_only';
		case 'both':
			return 'both';
		case 'smart':
		default:
			return 'sms_first';
	}
}

/**
 * Seed the automation sequences (recipes) for a freshly-provisioned org. Mirrors
 * the one-time backfill in migrations 0087 (speed_to_lead) + 0088 (missed_call),
 * but for new orgs — those migrations only touched orgs that already existed.
 *
 * Reads the org's automation_settings row (inserted earlier in the same tx) so
 * step 0 + the on/off toggle stay consistent with the flat settings the rest of
 * the app still reads. Idempotent via the sequences/steps unique indexes.
 *
 * MUST run after the automation_settings insert in the provisioning transaction.
 */
export async function seedAutomationSequences(orgId: string, client: DbOrTx = db): Promise<void> {
	const [settings] = await client
		.select()
		.from(automationSettings)
		.where(eq(automationSettings.org_id, orgId));
	if (!settings) {
		throw new Error(`seedAutomationSequences: no automation_settings row for org ${orgId}`);
	}

	// ── speed_to_lead ──────────────────────────────────────────────────────────
	const [stl] = await client
		.insert(automationSequences)
		.values({
			org_id: orgId,
			key: 'speed_to_lead',
			enabled: settings.speed_to_lead_enabled,
			channel: speedToLeadChannel(settings.speed_to_lead_channel)
		})
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (stl) {
		await client.insert(automationSequenceSteps).values([
			{
				org_id: orgId,
				sequence_id: stl.id,
				position: 0,
				delay_minutes: 0,
				channel: null,
				sms_body: settings.speed_to_lead_message,
				email_subject: settings.speed_to_lead_email_subject,
				email_body: settings.speed_to_lead_email_message
			},
			...SPEED_TO_LEAD_FOLLOWUPS.map((s) => ({
				org_id: orgId,
				sequence_id: stl.id,
				position: s.position,
				delay_minutes: s.delay_minutes,
				channel: s.channel,
				sms_body: s.sms_body,
				email_subject: s.email_subject,
				email_body: s.email_body
			}))
		]);
	}

	// ── missed_call ──────────────────────────────────────────────────────────────
	const [mc] = await client
		.insert(automationSequences)
		.values({
			org_id: orgId,
			key: 'missed_call',
			enabled: settings.missed_call_textback_enabled,
			channel: 'sms_only'
		})
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (mc) {
		await client.insert(automationSequenceSteps).values([
			{
				org_id: orgId,
				sequence_id: mc.id,
				position: 0,
				delay_minutes: 0,
				channel: null,
				sms_body: settings.missed_call_textback_message,
				email_subject: null,
				email_body: null
			},
			...MISSED_CALL_FOLLOWUPS.map((s) => ({
				org_id: orgId,
				sequence_id: mc.id,
				position: s.position,
				delay_minutes: s.delay_minutes,
				channel: s.channel,
				sms_body: s.sms_body,
				email_subject: null,
				email_body: null
			}))
		]);
	}

	// ── quote_followup (Stage 3.c.2) ─────────────────────────────────────────────
	// SMS-only, contact-anchored; runs from quote.sent time. Clean port of the old
	// 2-step hardcoded follow-up. Cadence from the org's settings delays; both
	// steps reuse quote_followup_message. MUST stay in sync with migration 0090.
	const [qf] = await client
		.insert(automationSequences)
		.values({
			org_id: orgId,
			key: 'quote_followup',
			enabled: settings.quote_followup_enabled,
			channel: 'sms_only'
		})
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (qf) {
		await client.insert(automationSequenceSteps).values([
			{
				org_id: orgId,
				sequence_id: qf.id,
				position: 0,
				delay_minutes: settings.quote_followup_delay_1_hours * 60,
				channel: null,
				sms_body: settings.quote_followup_message,
				email_subject: null,
				email_body: null
			},
			{
				org_id: orgId,
				sequence_id: qf.id,
				position: 1,
				delay_minutes:
					Math.max(
						settings.quote_followup_delay_2_hours - settings.quote_followup_delay_1_hours,
						0
					) * 60,
				channel: null,
				sms_body: settings.quote_followup_message,
				email_subject: null,
				email_body: null
			}
		]);
	}

	// ── invoice_dunning (Stage 3.c.2) ────────────────────────────────────────────
	// SMS-only, invoice-anchored; steps fire at due_date + offset (engine anchors to
	// due_date). Clean port of the old due+0/3/7/14 cadence. delay_minutes chains
	// from the previous step (0, 3d, 4d, 7d → cumulative 0/3/7/14). All steps reuse
	// invoice_reminder_message. MUST stay in sync with migration 0090.
	const [id] = await client
		.insert(automationSequences)
		.values({
			org_id: orgId,
			key: 'invoice_dunning',
			enabled: settings.invoice_reminder_enabled,
			channel: 'sms_only'
		})
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (id) {
		await client.insert(automationSequenceSteps).values(
			[0, 4320, 5760, 10080].map((delay_minutes, position) => ({
				org_id: orgId,
				sequence_id: id.id,
				position,
				delay_minutes,
				channel: null,
				sms_body: settings.invoice_reminder_message,
				email_subject: null,
				email_body: null
			}))
		);
	}

	// ── appointment_reminder (Stage 3.c.3) ───────────────────────────────────────
	// SMS-only, appointment-anchored. Steps carry NEGATIVE offset_minutes so the
	// engine fires them relative to scheduled_start: -1440 = 24h before, -60 = 1h
	// before. Clean port of the old hardcoded 24h/1h reminders — both always fire
	// (the 1h toggle only swaps the copy, matching prior behaviour). MUST stay in
	// sync with migration 0092. Richer presets/channels are a 3.d UI concern.
	const oneHourBody =
		settings.appointment_reminder_1h_enabled && settings.appointment_reminder_1h_message
			? settings.appointment_reminder_1h_message
			: settings.appointment_reminder_message;
	const [ar] = await client
		.insert(automationSequences)
		.values({
			org_id: orgId,
			key: 'appointment_reminder',
			enabled: settings.appointment_reminder_enabled,
			channel: 'sms_only'
		})
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (ar) {
		await client.insert(automationSequenceSteps).values([
			{
				org_id: orgId,
				sequence_id: ar.id,
				position: 0,
				delay_minutes: 0,
				offset_minutes: -1440,
				channel: null,
				sms_body: settings.appointment_reminder_message,
				email_subject: null,
				email_body: null
			},
			{
				org_id: orgId,
				sequence_id: ar.id,
				position: 1,
				delay_minutes: 0,
				offset_minutes: -60,
				channel: null,
				sms_body: oneHourBody,
				email_subject: null,
				email_body: null
			}
		]);
	}

	// ── appointment_no_show (Stage 3.c.3b) ───────────────────────────────────────
	// Customer SMS re-engagement, contact-anchored (like missed_call): instant text
	// when staff mark a no-show + one follow-up. Seeded DISABLED — net-new behaviour,
	// opt-in until the 3.d UI exposes it (no automation_settings field drives it).
	// There's no flat-settings copy for this card, so the defaults live here only.
	// MUST stay in sync with migration 0094.
	const [ns] = await client
		.insert(automationSequences)
		.values({ org_id: orgId, key: 'appointment_no_show', enabled: false, channel: 'sms_only' })
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (ns) {
		await client.insert(automationSequenceSteps).values([
			{
				org_id: orgId,
				sequence_id: ns.id,
				position: 0,
				delay_minutes: 0,
				channel: null,
				sms_body:
					"Hi {contact_name}, sorry we missed you for your appointment. Would you like to reschedule? Reply here and we'll find a new time.",
				email_subject: null,
				email_body: null
			},
			{
				org_id: orgId,
				sequence_id: ns.id,
				position: 1,
				delay_minutes: 1440,
				channel: null,
				sms_body:
					"Hi {contact_name}, still happy to help whenever you're ready — reply here and we'll get you back on the calendar.",
				email_subject: null,
				email_body: null
			}
		]);
	}

	// ── appointment_quote_nudge (Stage 3.c.3b) ───────────────────────────────────
	// STAFF in-app nudge fired ~2h after a completed appointment IF no quote was
	// raised for the contact since the visit (no_quote_since_anchor). audience='staff'
	// → the engine notifies the office/crew, not the customer. email_subject = the
	// notification title, sms_body = the body. Seeded DISABLED (opt-in). MUST stay in
	// sync with migration 0094.
	const [qn] = await client
		.insert(automationSequences)
		.values({ org_id: orgId, key: 'appointment_quote_nudge', enabled: false, channel: 'sms_only' })
		.onConflictDoNothing({ target: [automationSequences.org_id, automationSequences.key] })
		.returning();
	if (qn) {
		await client.insert(automationSequenceSteps).values([
			{
				org_id: orgId,
				sequence_id: qn.id,
				position: 0,
				delay_minutes: 0,
				offset_minutes: 120,
				audience: 'staff',
				condition: 'no_quote_since_anchor',
				channel: null,
				sms_body:
					"You completed an appointment with {contact_name} but haven't sent a quote yet. Follow up to win the job.",
				email_subject: 'No quote sent yet for {contact_name}',
				email_body: null
			}
		]);
	}
}
