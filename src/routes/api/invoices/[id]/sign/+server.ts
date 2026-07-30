import { json, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { invoices, media, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { canEditInvoice } from '$lib/server/invoices/permissions';
import { assertAndIncrementUsage, BYTES_PER_GB } from '$lib/server/usage/assertAndIncrementUsage';

// In-person invoice signature — "sign on this device". The contractor hands over their device and
// the customer draws their acknowledgement of the invoice. The drawn image is already uploaded to
// R2 as an 'invoice_signature' media row (client-side); this route binds it to the invoice by
// stamping signature_name / signature_media_id / signed_at. Pure record — it never changes status
// or money, so there is NO outbox event (nothing external fires). Mirrors quotes' sign-in-person,
// minus the acceptance/money math (an invoice's total is already fixed).

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const invoiceId = event.params.id!;

	let signerName: string;
	let signatureMediaId: string;
	try {
		const body = await event.request.json();
		const name = String(body?.signer_name ?? '').trim();
		if (!name || name.length < 2) {
			return json({ error: 'Please enter the customer’s full name to sign.' }, { status: 400 });
		}
		if (name.length > 200) {
			return json({ error: 'Name is too long.' }, { status: 400 });
		}
		signerName = name;
		const mediaId = String(body?.signature_media_id ?? '').trim();
		if (!mediaId) {
			return json({ error: 'Signature is required.' }, { status: 400 });
		}
		signatureMediaId = mediaId;
	} catch {
		return json({ error: 'Signature is required.' }, { status: 400 });
	}

	await db.transaction(async (tx) => {
		const [inv] = await tx
			.select({ id: invoices.id })
			.from(invoices)
			.where(
				and(eq(invoices.id, invoiceId), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
			)
			.limit(1);
		if (!inv) throw error(404, 'Invoice not found');

		// The drawn signature must be a real 'invoice_signature' media row for THIS invoice + org —
		// the browser can never point acknowledgement at a foreign or unrelated image.
		const [sig] = await tx
			.select({ id: media.id })
			.from(media)
			.where(
				and(
					eq(media.id, signatureMediaId),
					eq(media.org_id, auth.orgId),
					eq(media.invoice_id, invoiceId),
					eq(media.purpose_tag, 'invoice_signature'),
					isNull(media.deleted_at)
				)
			)
			.limit(1);
		if (!sig) throw error(400, 'Signature not found for this invoice');

		await tx
			.update(invoices)
			.set({
				signature_name: signerName,
				signature_media_id: signatureMediaId,
				signed_at: new Date(),
				updated_at: new Date()
			})
			.where(eq(invoices.id, invoiceId));
	});

	return json({ data: { id: invoiceId } });
};

// Clear & redo — drop the captured signature and free its R2 storage. Clears the three invoice
// columns and soft-deletes the media row (with the media.deleted outbox event so the worker purges
// R2), atomically. Idempotent: no signature on file → 204 no-op.
export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!canEditInvoice(auth.member)) error(403, 'Forbidden');

	const invoiceId = event.params.id!;

	await db.transaction(async (tx) => {
		const [inv] = await tx
			.select({ id: invoices.id, signature_media_id: invoices.signature_media_id })
			.from(invoices)
			.where(
				and(eq(invoices.id, invoiceId), eq(invoices.org_id, auth.orgId), isNull(invoices.deleted_at))
			)
			.limit(1);
		if (!inv) throw error(404, 'Invoice not found');

		// Nothing to clear — leave early (still 204 to the caller).
		if (!inv.signature_media_id) return;

		await tx
			.update(invoices)
			.set({
				signature_name: null,
				signature_media_id: null,
				signed_at: null,
				updated_at: new Date()
			})
			.where(eq(invoices.id, invoiceId));

		// Soft-delete the drawn image + release its storage quota + emit media.deleted (R2 purge).
		const [sig] = await tx
			.select({
				id: media.id,
				file_size_bytes: media.file_size_bytes,
				r2_key: media.r2_key,
				thumbnail_key: media.thumbnail_key,
				web_key: media.web_key
			})
			.from(media)
			.where(
				and(
					eq(media.id, inv.signature_media_id),
					eq(media.org_id, auth.orgId),
					eq(media.purpose_tag, 'invoice_signature'),
					isNull(media.deleted_at)
				)
			)
			.limit(1);
		if (!sig) return;

		await tx
			.update(media)
			.set({ deleted_at: new Date(), updated_at: new Date() })
			.where(and(eq(media.id, sig.id), isNull(media.deleted_at)));

		await assertAndIncrementUsage(tx, {
			orgId: auth.orgId,
			metric: 'storage_bytes',
			limit: auth.limits.max_storage_gb * BYTES_PER_GB,
			increment: -sig.file_size_bytes
		});

		await tx
			.insert(outboxEvents)
			.values({
				org_id: auth.orgId,
				event_type: 'media.deleted',
				resource_type: 'media',
				resource_id: sig.id,
				payload: {
					media_id: sig.id,
					org_id: auth.orgId,
					r2_key: sig.r2_key,
					thumbnail_key: sig.thumbnail_key,
					web_key: sig.web_key
				},
				idempotency_key: `media.deleted:${sig.id}`
			})
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });
	});

	return new Response(null, { status: 204 });
};
