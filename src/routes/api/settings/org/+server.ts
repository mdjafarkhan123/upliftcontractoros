import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, media, outboxEvents, automationSettings } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { isValidHexColor, normalizeHexColor } from '$lib/utils/validation/hexColor';
import { isValidIanaTimezone } from '$lib/utils/validation/ianaTimezone';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';

function assertAdmin(role: string): void {
	if (role !== 'admin') error(403, 'Admin only.');
}

const orgPatchSchema = z
	.object({
		name: z.string().min(1).max(200).trim().optional(),
		trade_type: z.string().min(1).max(100).trim().optional(),
		timezone: z.string().min(1).max(100).optional(),
		address: z.string().max(500).trim().nullable().optional(),
		city: z.string().max(100).trim().nullable().optional(),
		state: z.string().max(100).trim().nullable().optional(),
		zip: z.string().max(20).trim().nullable().optional(),
		primary_color: z.string().max(20).nullable().optional(),
		tagline: z.string().max(120).trim().nullable().optional(),
		logo_url: z.string().uuid().nullable().optional(), // media row id
		signature_block_enabled: z.boolean().optional(),
		signature_name: z.string().max(120).trim().nullable().optional(),
		signature_title: z.string().max(120).trim().nullable().optional(),
		signature_statement: z.string().max(300).trim().nullable().optional(),
		signature_image_url: z.string().uuid().nullable().optional(), // media row id
		google_review_link: z
			.string()
			.url()
			.regex(/^https:\/\//, 'Must be an https URL.')
			.max(500)
			.nullable()
			.optional(),
		calendar_day_start_hour: z.number().int().min(0).max(23).optional(),
		calendar_day_end_hour: z.number().int().min(1).max(24).optional(),
		quiet_hours_enabled: z.boolean().optional(),
		quiet_hours_start_hour: z.number().int().min(0).max(23).optional(),
		quiet_hours_end_hour: z.number().int().min(0).max(23).optional()
	})
	.strict();

function logChange(ctx: {
	request_id: string;
	org_id: string;
	member_id: string;
	route: string;
	changed_fields: string[];
}) {
	console.log(
		JSON.stringify({
			level: 'info',
			event: 'settings.org.updated',
			...ctx
		})
	);
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	const [row] = await db
		.select({
			name: organizations.name,
			trade_type: organizations.trade_type,
			timezone: organizations.timezone,
			address: organizations.address,
			city: organizations.city,
			state: organizations.state,
			zip: organizations.zip,
			primary_color: organizations.primary_color,
			tagline: organizations.tagline,
			logo_url: organizations.logo_url,
			signature_block_enabled: organizations.signature_block_enabled,
			signature_name: organizations.signature_name,
			signature_title: organizations.signature_title,
			signature_statement: organizations.signature_statement,
			signature_image_url: organizations.signature_image_url,
			calendar_day_start_hour: organizations.calendar_day_start_hour,
			calendar_day_end_hour: organizations.calendar_day_end_hour,
			quiet_hours_enabled: organizations.quiet_hours_enabled,
			quiet_hours_start_hour: organizations.quiet_hours_start_hour,
			quiet_hours_end_hour: organizations.quiet_hours_end_hour,
			google_review_link: automationSettings.google_review_link
		})
		.from(organizations)
		.leftJoin(automationSettings, eq(automationSettings.org_id, organizations.id))
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	if (!row) error(404, 'Organization not found.');

	return json({
		data: {
			...row,
			logo_url: await resolveLogoUrl(row.logo_url),
			signature_image_url: await resolveLogoUrl(row.signature_image_url)
		}
	});
};

export const PATCH: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	assertAdmin(auth.member.role);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = orgPatchSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0]?.toString();
			if (key) field_errors[key] = issue.message;
		}
		return json({ error: 'Unknown or invalid fields.', field_errors }, { status: 400 });
	}

	const input = parsed.data;
	const field_errors: Record<string, string> = {};

	const updates: Partial<typeof organizations.$inferInsert> = {};

	if (input.name !== undefined) updates.name = input.name;
	if (input.trade_type !== undefined) updates.trade_type = input.trade_type;

	if (input.timezone !== undefined) {
		if (!isValidIanaTimezone(input.timezone)) {
			field_errors.timezone = 'Invalid IANA timezone.';
		} else {
			updates.timezone = input.timezone;
		}
	}

	if (input.address !== undefined) updates.address = input.address;
	if (input.city !== undefined) updates.city = input.city;
	if (input.state !== undefined) updates.state = input.state;
	if (input.zip !== undefined) updates.zip = input.zip;
	if (input.tagline !== undefined) updates.tagline = input.tagline || null;

	// Business signature block — typed fields apply directly; the image is resolved
	// from a media row below (same pattern as the logo).
	if (input.signature_name !== undefined) updates.signature_name = input.signature_name || null;
	if (input.signature_title !== undefined) updates.signature_title = input.signature_title || null;
	if (input.signature_statement !== undefined)
		updates.signature_statement = input.signature_statement || null;

	if (input.primary_color !== undefined) {
		if (input.primary_color === null) {
			updates.primary_color = null;
		} else if (!isValidHexColor(input.primary_color)) {
			field_errors.primary_color = 'Must be a hex color like #3b82f6.';
		} else {
			updates.primary_color = normalizeHexColor(input.primary_color);
		}
	}

	const startNext =
		input.calendar_day_start_hour !== undefined ? input.calendar_day_start_hour : undefined;
	const endNext =
		input.calendar_day_end_hour !== undefined ? input.calendar_day_end_hour : undefined;
	if (startNext !== undefined || endNext !== undefined) {
		const [existing] = await db
			.select({
				s: organizations.calendar_day_start_hour,
				e: organizations.calendar_day_end_hour
			})
			.from(organizations)
			.where(eq(organizations.id, auth.orgId))
			.limit(1);
		const s = startNext ?? existing?.s ?? 7;
		const e = endNext ?? existing?.e ?? 19;
		if (e <= s) {
			field_errors.calendar_day_end_hour = 'End hour must be after start hour.';
		} else {
			if (startNext !== undefined) updates.calendar_day_start_hour = startNext;
			if (endNext !== undefined) updates.calendar_day_end_hour = endNext;
		}
	}

	// Quiet hours: hours are 0–23 and may wrap overnight (start > end), so unlike the
	// calendar range we only reject a degenerate window (start === end) when quiet
	// hours is enabled. Validate against the resolved enabled+start+end set.
	if (
		input.quiet_hours_enabled !== undefined ||
		input.quiet_hours_start_hour !== undefined ||
		input.quiet_hours_end_hour !== undefined
	) {
		const [existing] = await db
			.select({
				enabled: organizations.quiet_hours_enabled,
				s: organizations.quiet_hours_start_hour,
				e: organizations.quiet_hours_end_hour
			})
			.from(organizations)
			.where(eq(organizations.id, auth.orgId))
			.limit(1);
		const enabled = input.quiet_hours_enabled ?? existing?.enabled ?? true;
		const s = input.quiet_hours_start_hour ?? existing?.s ?? 21;
		const e = input.quiet_hours_end_hour ?? existing?.e ?? 8;
		if (enabled && s === e) {
			field_errors.quiet_hours_end_hour = 'Start and end hours must differ.';
		} else {
			if (input.quiet_hours_enabled !== undefined)
				updates.quiet_hours_enabled = input.quiet_hours_enabled;
			if (input.quiet_hours_start_hour !== undefined)
				updates.quiet_hours_start_hour = input.quiet_hours_start_hour;
			if (input.quiet_hours_end_hour !== undefined)
				updates.quiet_hours_end_hour = input.quiet_hours_end_hour;
		}
	}

	if (input.logo_url !== undefined) {
		if (input.logo_url === null) {
			updates.logo_url = null;
		} else {
			const [m] = await db
				.select({ id: media.id, r2_key: media.r2_key })
				.from(media)
				.where(
					and(eq(media.id, input.logo_url), eq(media.org_id, auth.orgId), isNull(media.deleted_at))
				)
				.limit(1);
			if (!m) {
				field_errors.logo_url = 'Logo must reference an uploaded media file.';
			} else {
				updates.logo_url = m.r2_key;
			}
		}
	}

	if (input.signature_image_url !== undefined) {
		if (input.signature_image_url === null) {
			updates.signature_image_url = null;
		} else {
			const [m] = await db
				.select({ id: media.id, r2_key: media.r2_key })
				.from(media)
				.where(
					and(
						eq(media.id, input.signature_image_url),
						eq(media.org_id, auth.orgId),
						isNull(media.deleted_at)
					)
				)
				.limit(1);
			if (!m) {
				field_errors.signature_image_url = 'Signature image must reference an uploaded file.';
			} else {
				updates.signature_image_url = m.r2_key;
			}
		}
	}

	// Guard: the signature block can't be turned on with no authorizer name — it would
	// render an empty "Authorized by" stamp. Resolve against the incoming value first,
	// falling back to what's already stored.
	if (input.signature_block_enabled !== undefined) {
		const enabling = input.signature_block_enabled === true;
		if (enabling) {
			let resolvedName = input.signature_name?.trim() || null;
			if (input.signature_name === undefined) {
				const [existing] = await db
					.select({ name: organizations.signature_name })
					.from(organizations)
					.where(eq(organizations.id, auth.orgId))
					.limit(1);
				resolvedName = existing?.name?.trim() || null;
			}
			if (!resolvedName) {
				field_errors.signature_name = 'Add an authorizer name to turn on the signature block.';
			} else {
				updates.signature_block_enabled = true;
			}
		} else {
			updates.signature_block_enabled = false;
		}
	}

	if (Object.keys(field_errors).length > 0) {
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const googleReviewLinkChanging = input.google_review_link !== undefined;

	if (Object.keys(updates).length === 0 && !googleReviewLinkChanging) {
		return json({ error: 'No editable fields provided.' }, { status: 400 });
	}

	const orgHasUpdates = Object.keys(updates).length > 0;
	if (orgHasUpdates) updates.updated_at = new Date();

	const logoChanging = 'logo_url' in updates;
	const newLogoKey = (updates.logo_url ?? null) as string | null;
	const signatureImageChanging = 'signature_image_url' in updates;
	const newSignatureKey = (updates.signature_image_url ?? null) as string | null;

	const returningCols = {
		name: organizations.name,
		trade_type: organizations.trade_type,
		timezone: organizations.timezone,
		address: organizations.address,
		city: organizations.city,
		state: organizations.state,
		zip: organizations.zip,
		primary_color: organizations.primary_color,
		tagline: organizations.tagline,
		logo_url: organizations.logo_url,
		signature_block_enabled: organizations.signature_block_enabled,
		signature_name: organizations.signature_name,
		signature_title: organizations.signature_title,
		signature_statement: organizations.signature_statement,
		signature_image_url: organizations.signature_image_url,
		calendar_day_start_hour: organizations.calendar_day_start_hour,
		calendar_day_end_hour: organizations.calendar_day_end_hour,
		quiet_hours_enabled: organizations.quiet_hours_enabled,
		quiet_hours_start_hour: organizations.quiet_hours_start_hour,
		quiet_hours_end_hour: organizations.quiet_hours_end_hour
	};

	const updated = await db.transaction(async (tx) => {
		if (googleReviewLinkChanging) {
			await tx
				.update(automationSettings)
				.set({ google_review_link: input.google_review_link ?? null, updated_at: new Date() })
				.where(eq(automationSettings.org_id, auth.orgId));
		}

		// If the logo is changing, look up the previous media row (by prior r2_key)
		// so we can soft-delete it and emit media.deleted through the outbox.
		let prevLogoMedia: typeof media.$inferSelect | null = null;
		if (logoChanging) {
			const [prevOrg] = await tx
				.select({ logo_url: organizations.logo_url })
				.from(organizations)
				.where(eq(organizations.id, auth.orgId))
				.limit(1);
			const prevKey = prevOrg?.logo_url ?? null;
			if (prevKey && prevKey !== newLogoKey) {
				const [row] = await tx
					.select()
					.from(media)
					.where(
						and(eq(media.org_id, auth.orgId), eq(media.r2_key, prevKey), isNull(media.deleted_at))
					)
					.limit(1);
				prevLogoMedia = row ?? null;
			}
		}

		// Same cleanup for a replaced/removed signature image.
		let prevSignatureMedia: typeof media.$inferSelect | null = null;
		if (signatureImageChanging) {
			const [prevOrg] = await tx
				.select({ signature_image_url: organizations.signature_image_url })
				.from(organizations)
				.where(eq(organizations.id, auth.orgId))
				.limit(1);
			const prevKey = prevOrg?.signature_image_url ?? null;
			if (prevKey && prevKey !== newSignatureKey) {
				const [row] = await tx
					.select()
					.from(media)
					.where(
						and(eq(media.org_id, auth.orgId), eq(media.r2_key, prevKey), isNull(media.deleted_at))
					)
					.limit(1);
				prevSignatureMedia = row ?? null;
			}
		}

		let row: Record<string, unknown> | undefined;
		if (orgHasUpdates) {
			[row] = await tx
				.update(organizations)
				.set(updates)
				.where(eq(organizations.id, auth.orgId))
				.returning(returningCols);
		} else {
			[row] = await tx
				.select(returningCols)
				.from(organizations)
				.where(eq(organizations.id, auth.orgId))
				.limit(1);
		}

		if (prevLogoMedia) {
			await tx
				.update(media)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(and(eq(media.id, prevLogoMedia.id), isNull(media.deleted_at)));

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'media.deleted',
				resource_type: 'media',
				resource_id: prevLogoMedia.id,
				payload: {
					media_id: prevLogoMedia.id,
					org_id: auth.orgId,
					r2_key: prevLogoMedia.r2_key,
					thumbnail_key: prevLogoMedia.thumbnail_key,
					web_key: prevLogoMedia.web_key
				},
				idempotency_key: `media.deleted:${prevLogoMedia.id}`
			});
		}

		if (prevSignatureMedia) {
			await tx
				.update(media)
				.set({ deleted_at: new Date(), updated_at: new Date() })
				.where(and(eq(media.id, prevSignatureMedia.id), isNull(media.deleted_at)));

			await tx.insert(outboxEvents).values({
				org_id: auth.orgId,
				event_type: 'media.deleted',
				resource_type: 'media',
				resource_id: prevSignatureMedia.id,
				payload: {
					media_id: prevSignatureMedia.id,
					org_id: auth.orgId,
					r2_key: prevSignatureMedia.r2_key,
					thumbnail_key: prevSignatureMedia.thumbnail_key,
					web_key: prevSignatureMedia.web_key
				},
				idempotency_key: `media.deleted:${prevSignatureMedia.id}`
			});
		}

		return row;
	});

	if (!updated) error(404, 'Organization not found.');
	const resolvedLogo = await resolveLogoUrl(updated.logo_url as string | null);
	const resolvedSignatureImage = await resolveLogoUrl(updated.signature_image_url as string | null);

	const changed_fields = Object.keys(updates).filter((k) => k !== 'updated_at');
	if (googleReviewLinkChanging) changed_fields.push('google_review_link');

	logChange({
		request_id: crypto.randomUUID(),
		org_id: auth.orgId,
		member_id: auth.member.id,
		route: 'PATCH /api/settings/org',
		changed_fields
	});

	return json({
		data: {
			...updated,
			logo_url: resolvedLogo,
			signature_image_url: resolvedSignatureImage,
			google_review_link: googleReviewLinkChanging
				? (input.google_review_link ?? null)
				: ((
						await db
							.select({ v: automationSettings.google_review_link })
							.from(automationSettings)
							.where(eq(automationSettings.org_id, auth.orgId))
							.limit(1)
					)[0]?.v ?? null)
		}
	});
};
