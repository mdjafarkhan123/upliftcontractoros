import { json, error } from '@sveltejs/kit';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { media, outboxEvents } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { assertAndIncrementUsage, BYTES_PER_GB } from '$lib/server/usage/assertAndIncrementUsage';

export const DELETE: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);

	if (!auth.member.can_upload_files) {
		error(403, 'Forbidden: upload permission required to delete files');
	}

	const id = event.params.id!;

	const [row] = await db
		.select()
		.from(media)
		.where(and(eq(media.id, id), eq(media.org_id, auth.orgId)))
		.limit(1);

	if (!row) error(404, 'Media not found');

	// Idempotency: already soft-deleted → success/no-op, no duplicate event
	if (row.deleted_at !== null) {
		return new Response(null, { status: 204 });
	}

	const idempotencyKey = `media.deleted:${id}`;

	await db.transaction(async (tx) => {
		await tx
			.update(media)
			.set({ deleted_at: new Date(), updated_at: new Date() })
			.where(and(eq(media.id, id), isNull(media.deleted_at)));

		// Release the storage quota the file was consuming. Negative increment
		// never throws on the limit; DB CHECK (value >= 0) guards against
		// underflow if a counter ever drifted below the on-disk total.
		await assertAndIncrementUsage(tx, {
			orgId: auth.orgId,
			metric: 'storage_bytes',
			limit: auth.limits.max_storage_gb * BYTES_PER_GB,
			increment: -row.file_size_bytes
		});

		// Emit media.deleted with all R2 keys in payload so worker never re-queries DB
		await tx.insert(outboxEvents).values({
			org_id: auth.orgId,
			event_type: 'media.deleted',
			resource_type: 'media',
			resource_id: id,
			payload: {
				media_id: id,
				org_id: auth.orgId,
				r2_key: row.r2_key,
				thumbnail_key: row.thumbnail_key,
				web_key: row.web_key
			},
			idempotency_key: idempotencyKey
		});
	});

	return new Response(null, { status: 204 });
};
