import { json, error, isHttpError } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canSendInvoice } from '$lib/server/invoices/permissions';
import { sendInvoiceSchema } from '$lib/server/invoices/schemas';
import { sendInvoice } from '$lib/server/invoices/send';

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canSendInvoice(auth.member)) error(403, 'Forbidden');

	const id = event.params.id!;

	// Parse the optional channel/copy override. A bodyless POST (legacy / re-send button)
	// keeps the old behaviour: deliver on every available channel with the default copy.
	let send: import('$lib/server/invoices/schemas').SendInvoiceInput | null = null;
	try {
		const raw = await event.request.json();
		const parsed = sendInvoiceSchema.safeParse(raw);
		if (!parsed.success) {
			const fieldErrors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
			}
			return json(
				{ error: 'Please fix the highlighted fields', field_errors: fieldErrors },
				{ status: 422 }
			);
		}
		send = parsed.data;
	} catch {
		send = null;
	}

	// When channels were chosen, pre-validate reachability HERE so we can return the
	// channel-scoped `field_errors` shape the NotifyDialog maps to an inline field error.
	// (The shared sendInvoice() helper also guards this, but only as a plain 422 for the
	// batch path — here we want the richer response.)
	if (send) {
		const [reach] = await db.execute<{ email: string | null; sms_opt_out: boolean }>(sql`
			SELECT c.email, c.sms_opt_out
			FROM invoices i JOIN contacts c ON c.id = i.contact_id
			WHERE i.id = ${id} AND i.org_id = ${auth.orgId} AND i.deleted_at IS NULL
		`);
		if (reach) {
			if (send.channels.includes('email') && !reach.email) {
				return json(
					{
						error: 'This customer has no email address — choose Text instead.',
						field_errors: { channels: 'No email on file for this customer' }
					},
					{ status: 422 }
				);
			}
			if (send.channels.includes('sms') && reach.sms_opt_out) {
				return json(
					{
						error: 'This customer opted out of texts — choose Email instead.',
						field_errors: { channels: 'This customer opted out of texts' }
					},
					{ status: 422 }
				);
			}
		}
	}

	try {
		const result = await sendInvoice(auth.orgId, id, send);
		return json({
			data: {
				id: result.id,
				status: result.status,
				sent_at: result.sent_at.toISOString()
			}
		});
	} catch (err) {
		// The helper throws SvelteKit errors for reachability/state problems; surface the
		// message under the fixed { error } shape rather than leaking a raw 500.
		if (isHttpError(err)) return json({ error: err.body.message }, { status: err.status });
		throw err;
	}
};
