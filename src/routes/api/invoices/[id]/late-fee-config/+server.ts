import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice } from '$lib/server/invoices/permissions';

const bodySchema = z.object({
	enabled: z.boolean(),
	type: z.enum(['flat', 'percent']),
	value: z.coerce.number().min(0).max(1_000_000).nullable()
});

// Per-invoice late-fee TERMS (M8 Phase 2). Works at ANY status — the contractor can set or
// adjust the fee for a specific invoice before OR after sending, up until a fee is actually
// applied. This route persists the invoice's snapshot columns only; the EFFECTIVE gate
// (org.late_fee_enabled AND invoice.late_fee_enabled) is enforced where the money is charged —
// the manual "Add late fee" button and the auto-after-grace nightly sweep both read these values.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: 'Invalid input' }, { status: 422 });
	}
	const { enabled, type, value } = parsed.data;

	// An enabled fee must carry a positive amount so the charge path never inserts a $0 line.
	if (enabled && (value == null || value <= 0)) {
		return json(
			{
				error:
					type === 'flat' ? 'Enter a flat fee greater than 0' : 'Enter a percentage greater than 0'
			},
			{ status: 422 }
		);
	}
	const valueStr = value == null ? null : value.toFixed(2);

	const result = await db.execute(sql`
		UPDATE invoices
		SET late_fee_enabled = ${enabled},
			late_fee_type = ${type},
			late_fee_value = ${valueStr},
			updated_at = now()
		WHERE id = ${id} AND org_id = ${auth.orgId} AND deleted_at IS NULL
		RETURNING id
	`);
	if (result.length === 0) error(404, 'Invoice not found');

	return json({
		data: { id, late_fee_enabled: enabled, late_fee_type: type, late_fee_value: valueStr }
	});
};
