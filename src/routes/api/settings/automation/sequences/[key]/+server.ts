import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { automationSequences, automationSequenceSteps } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { validateTemplateVariablesAgainst } from '$lib/utils/validation/templateVariables';
import {
	getCardDef,
	STEP_DELAY_MAX,
	STEP_OFFSET_ABS_MAX,
	BODY_MAX,
	SUBJECT_MAX,
	type AutomationCardDef,
	type StepChannel
} from '$lib/automation/cardDefinitions';

// Update one engine-backed automation card (Stage 3.d.1): its on/off toggle,
// default channel, and full ordered step list. The whole steps array is
// replaced inside a transaction. Per the live-edit decision, edits take effect
// at each enrollment's next advance (the engine re-reads steps at fire time);
// structure changes are safe because the engine completes any enrollment whose
// current_step index no longer exists.

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

const CHANNEL_VALUES = ['sms_first', 'email_first', 'both', 'sms_only', 'email_only'] as const;

const stepSchema = z.object({
	delay_minutes: z.number().int().min(0).max(STEP_DELAY_MAX),
	offset_minutes: z.number().int().min(-STEP_OFFSET_ABS_MAX).max(STEP_OFFSET_ABS_MAX).nullable(),
	channel: z.enum(CHANNEL_VALUES).nullable(),
	sms_body: z.string().max(BODY_MAX).nullable(),
	email_subject: z.string().max(SUBJECT_MAX).nullable(),
	email_body: z.string().max(2000).nullable()
});

const putSchema = z
	.object({
		updated_at: z.string().min(1),
		enabled: z.boolean(),
		channel: z.enum(CHANNEL_VALUES).optional(),
		steps: z.array(stepSchema).min(1).max(8)
	})
	.strict();

type ParsedStep = z.infer<typeof stepSchema>;

// Whether an effective channel can carry SMS / email — used to decide which
// bodies are required per step.
function channelSends(channel: StepChannel): { sms: boolean; email: boolean } {
	switch (channel) {
		case 'sms_first':
			return { sms: true, email: true }; // either, depending on contact data
		case 'email_first':
			return { sms: true, email: true };
		case 'both':
			return { sms: true, email: true };
		case 'sms_only':
			return { sms: true, email: false };
		case 'email_only':
			return { sms: false, email: true };
	}
}

// Validate the steps against the card's editing rules. Returns field_errors keyed
// by `steps.<index>.<field>` (the UI maps these onto the right step), or the
// normalised rows ready to insert.
function validateSteps(
	card: AutomationCardDef,
	sequenceChannel: StepChannel,
	steps: ParsedStep[]
): { errors: Record<string, string> } | { rows: NormalisedStep[] } {
	const errors: Record<string, string> = {};

	if (!card.stepsEditable && steps.length !== card.minSteps) {
		errors['steps'] = `This automation must have exactly ${card.minSteps} step(s).`;
	}
	if (steps.length < card.minSteps) errors['steps'] = `At least ${card.minSteps} step required.`;
	if (steps.length > card.maxSteps) errors['steps'] = `At most ${card.maxSteps} steps allowed.`;

	const rows: NormalisedStep[] = [];

	steps.forEach((step, i) => {
		const p = `steps.${i}`;
		const effectiveChannel: StepChannel = card.channelEditable
			? (step.channel ?? sequenceChannel)
			: sequenceChannel;

		// Timing rules per mode.
		let delay_minutes = step.delay_minutes;
		let offset_minutes: number | null = null;
		if (card.timingMode === 'offset' && card.audience !== 'staff') {
			if (step.offset_minutes === null) {
				errors[`${p}.offset_minutes`] = 'Choose when this reminder sends.';
			} else if (step.offset_minutes >= 0) {
				errors[`${p}.offset_minutes`] = 'Reminders must be scheduled before the appointment.';
			}
			offset_minutes = step.offset_minutes;
			delay_minutes = 0;
		} else if (card.audience === 'staff') {
			// Staff nudge: positive offset after the appointment ends.
			if (step.offset_minutes === null || step.offset_minutes <= 0) {
				errors[`${p}.offset_minutes`] = 'Choose how long after the appointment to remind your team.';
			}
			offset_minutes = step.offset_minutes;
			delay_minutes = 0;
		} else {
			// Delay mode. Step 0 is the instant reply for inbound cards.
			if (card.step0Instant && i === 0) delay_minutes = 0;
			offset_minutes = null;
		}

		// Channel override is only honoured on channel-editable cards.
		const channel: StepChannel | null = card.channelEditable ? (step.channel ?? null) : null;
		if (channel && !card.allowedChannels.includes(channel)) {
			errors[`${p}.channel`] = 'Unsupported channel for this automation.';
		}

		// Body requirements + template-variable validation.
		const sms = (step.sms_body ?? '').trim();
		const emailSubject = (step.email_subject ?? '').trim();
		const emailBody = (step.email_body ?? '').trim();

		if (card.audience === 'staff') {
			// email_subject = notification title, sms_body = notification body.
			if (!emailSubject) errors[`${p}.email_subject`] = 'A title is required.';
			if (!sms) errors[`${p}.sms_body`] = 'A message is required.';
		} else {
			const sends = channelSends(effectiveChannel);
			if (sends.sms && !sms) errors[`${p}.sms_body`] = 'A text message is required.';
			if (sends.email && card.emailCapable) {
				if (!emailSubject) errors[`${p}.email_subject`] = 'An email subject is required.';
				if (!emailBody) errors[`${p}.email_body`] = 'An email body is required.';
			}
		}

		for (const [field, value] of [
			['sms_body', step.sms_body],
			['email_subject', step.email_subject],
			['email_body', step.email_body]
		] as const) {
			if (typeof value === 'string' && value.length > 0) {
				const r = validateTemplateVariablesAgainst(value, card.allowedVars);
				if (!r.ok) {
					errors[`${p}.${field}`] = `Unknown field(s): ${r.unknown.map((u) => `{${u}}`).join(', ')}.`;
				}
			}
		}

		rows.push({
			position: i,
			delay_minutes,
			offset_minutes,
			channel,
			audience: card.audience,
			condition: card.audience === 'staff' ? 'no_quote_since_anchor' : null,
			sms_body: step.sms_body && step.sms_body.length ? step.sms_body : null,
			email_subject: step.email_subject && step.email_subject.length ? step.email_subject : null,
			email_body: step.email_body && step.email_body.length ? step.email_body : null
		});
	});

	if (Object.keys(errors).length > 0) return { errors };
	return { rows };
}

type NormalisedStep = {
	position: number;
	delay_minutes: number;
	offset_minutes: number | null;
	channel: StepChannel | null;
	audience: string;
	condition: string | null;
	sms_body: string | null;
	email_subject: string | null;
	email_body: string | null;
};

async function loadSequenceView(orgId: string, key: string) {
	const [seq] = await db
		.select({
			id: automationSequences.id,
			key: automationSequences.key,
			enabled: automationSequences.enabled,
			channel: automationSequences.channel,
			updated_at: sql<string>`${automationSequences.updated_at}::text`.as('updated_at')
		})
		.from(automationSequences)
		.where(and(eq(automationSequences.org_id, orgId), eq(automationSequences.key, key)));
	if (!seq) return null;

	const steps = await db
		.select({
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
		.where(eq(automationSequenceSteps.sequence_id, seq.id))
		.orderBy(asc(automationSequenceSteps.position));

	return {
		key: seq.key,
		enabled: seq.enabled,
		channel: seq.channel,
		updated_at: seq.updated_at,
		steps
	};
}

export const PUT: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const key = event.params.key;
	const card = getCardDef(key);
	if (!card) error(404, 'Unknown automation.');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = putSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const k = issue.path.join('.');
			if (k) field_errors[k] = issue.message;
		}
		return json({ error: 'Invalid request.', field_errors }, { status: 400 });
	}

	const input = parsed.data;

	// Resolve the sequence channel: editable cards take the submitted channel
	// (validated against the card), others keep their fixed channel.
	let sequenceChannel: StepChannel;
	if (card.channelEditable) {
		const submitted = input.channel ?? card.allowedChannels[0];
		if (!card.allowedChannels.includes(submitted)) {
			return json({ error: 'Unsupported channel.', field_errors: { channel: 'Unsupported channel.' } }, { status: 400 });
		}
		sequenceChannel = submitted;
	} else {
		sequenceChannel = card.allowedChannels[0] ?? 'sms_only';
	}

	const stepResult = validateSteps(card, sequenceChannel, input.steps);
	if ('errors' in stepResult) {
		return json({ error: 'Please fix the highlighted fields.', field_errors: stepResult.errors }, { status: 400 });
	}

	// Load the existing sequence (for concurrency + id). All provisioned orgs are
	// backfilled, but upsert defensively if it's somehow missing.
	const [existing] = await db
		.select({
			id: automationSequences.id,
			updated_at: sql<string>`${automationSequences.updated_at}::text`.as('updated_at')
		})
		.from(automationSequences)
		.where(and(eq(automationSequences.org_id, auth.orgId), eq(automationSequences.key, key)));

	if (existing && existing.updated_at !== input.updated_at) {
		const current = await loadSequenceView(auth.orgId, key);
		return json({ error: 'Settings changed elsewhere.', data: current }, { status: 409 });
	}

	const now = new Date();
	const txResult = await db.transaction(async (tx) => {
		let sequenceId: string;
		if (existing) {
			const [updated] = await tx
				.update(automationSequences)
				.set({ enabled: input.enabled, channel: sequenceChannel, updated_at: now })
				.where(
					and(
						eq(automationSequences.id, existing.id),
						sql`${automationSequences.updated_at}::text = ${input.updated_at}`
					)
				)
				.returning({ id: automationSequences.id });
			if (!updated) throw new ConcurrencyError();
			sequenceId = updated.id;
			await tx
				.delete(automationSequenceSteps)
				.where(eq(automationSequenceSteps.sequence_id, sequenceId));
		} else {
			const [created] = await tx
				.insert(automationSequences)
				.values({
					org_id: auth.orgId,
					key,
					enabled: input.enabled,
					channel: sequenceChannel,
					created_at: now,
					updated_at: now
				})
				.returning({ id: automationSequences.id });
			sequenceId = created.id;
		}

		await tx.insert(automationSequenceSteps).values(
			stepResult.rows.map((s) => ({
				org_id: auth.orgId,
				sequence_id: sequenceId,
				position: s.position,
				delay_minutes: s.delay_minutes,
				offset_minutes: s.offset_minutes,
				channel: s.channel,
				audience: s.audience,
				condition: s.condition,
				sms_body: s.sms_body,
				email_subject: s.email_subject,
				email_body: s.email_body,
				created_at: now,
				updated_at: now
			}))
		);
	}).catch((err) => {
		if (err instanceof ConcurrencyError) return 'conflict' as const;
		throw err;
	});

	if (txResult === 'conflict') {
		const current = await loadSequenceView(auth.orgId, key);
		return json({ error: 'Settings changed elsewhere.', data: current }, { status: 409 });
	}

	const view = await loadSequenceView(auth.orgId, key);
	if (!view) return json({ error: 'Automation not found.' }, { status: 404 });

	console.log(
		JSON.stringify({
			level: 'info',
			event: 'settings.automation.sequence_updated',
			org_id: auth.orgId,
			member_id: auth.member.id,
			route: `PUT /api/settings/automation/sequences/${key}`,
			key,
			enabled: input.enabled,
			step_count: stepResult.rows.length
		})
	);

	return json({ data: view });
};

class ConcurrencyError extends Error {}
