import { randomUUID } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, orgSmsCredit, smsCreditLedger } from '$lib/server/db/schema';
import { getCreditState, applyManualTopup } from '$lib/server/sms/credit';

// Auth: /api/admin/* is jafar-guarded in hooks.server.ts (401 without session).

const paramsSchema = z.object({ id: z.string().uuid() });

const money = z.number().finite().min(0, 'Must be zero or positive').max(1_000_000, 'Too large');

const configSchema = z
	.object({
		per_sms_cost: money.optional(),
		monthly_included_credit: money.optional(),
		show_cost_to_contractor: z.boolean().optional(),
		twilio_phone_number: z
			.string()
			.trim()
			.regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be E.164, e.g. +15551234567')
			.optional()
	})
	.refine(
		(v) =>
			v.per_sms_cost !== undefined ||
			v.monthly_included_credit !== undefined ||
			v.show_cost_to_contractor !== undefined ||
			v.twilio_phone_number !== undefined,
		{ message: 'No fields to update.' }
	);

const topupSchema = z.object({
	amount: z.number().finite().gt(0, 'Top-up must be greater than zero').max(1_000_000, 'Too large'),
	note: z.string().trim().max(500).optional()
});

const fmt = (n: number) => n.toFixed(4);

function fieldErrors(err: z.ZodError) {
	return Object.fromEntries(err.issues.map((i) => [String(i.path[0] ?? ''), i.message]));
}

export const GET: RequestHandler = async ({ params }) => {
	const parsed = paramsSchema.safeParse(params);
	if (!parsed.success) throw error(400, 'Invalid organization ID.');

	const credit = await getCreditState(db, parsed.data.id);
	if (!credit) return json({ error: 'Organization has no SMS credit account.' }, { status: 404 });

	const ledger = await db
		.select()
		.from(smsCreditLedger)
		.where(eq(smsCreditLedger.org_id, parsed.data.id))
		.orderBy(desc(smsCreditLedger.created_at))
		.limit(25);

	return json({ data: { credit, ledger } });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const raw = await request.json().catch(() => ({}));
	const parsed = configSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body.', field_errors: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}
	const { per_sms_cost, monthly_included_credit, show_cost_to_contractor, twilio_phone_number } =
		parsed.data;
	const now = new Date();

	if (
		per_sms_cost !== undefined ||
		monthly_included_credit !== undefined ||
		show_cost_to_contractor !== undefined
	) {
		const updated = await db
			.update(orgSmsCredit)
			.set({
				...(per_sms_cost !== undefined ? { per_sms_cost: fmt(per_sms_cost) } : {}),
				...(monthly_included_credit !== undefined
					? { monthly_included_credit: fmt(monthly_included_credit) }
					: {}),
				...(show_cost_to_contractor !== undefined ? { show_cost_to_contractor } : {}),
				updated_at: now
			})
			.where(eq(orgSmsCredit.org_id, parsedParams.data.id))
			.returning({ org_id: orgSmsCredit.org_id });
		if (updated.length === 0)
			return json({ error: 'Organization has no SMS credit account.' }, { status: 404 });
	}

	if (twilio_phone_number !== undefined) {
		const updated = await db
			.update(organizations)
			.set({ twilio_phone_number, updated_at: now })
			.where(eq(organizations.id, parsedParams.data.id))
			.returning({ id: organizations.id });
		if (updated.length === 0) throw error(404, 'Organization not found.');
	}

	const credit = await getCreditState(db, parsedParams.data.id);
	return json({ data: { credit } });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) throw error(400, 'Invalid organization ID.');

	const raw = await request.json().catch(() => ({}));
	const parsed = topupSchema.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ error: 'Invalid request body.', field_errors: fieldErrors(parsed.error) },
			{ status: 400 }
		);
	}

	try {
		const result = await db.transaction((tx) =>
			applyManualTopup(tx, {
				orgId: parsedParams.data.id,
				amount: fmt(parsed.data.amount),
				idempotencyKey: `manual_topup:${randomUUID()}`,
				createdBy: 'jafar',
				note: parsed.data.note ?? null
			})
		);
		const credit = await getCreditState(db, parsedParams.data.id);
		return json({ data: { balance_after: result.balanceAfter, credit } }, { status: 201 });
	} catch {
		return json({ error: 'Organization has no SMS credit account.' }, { status: 404 });
	}
};
