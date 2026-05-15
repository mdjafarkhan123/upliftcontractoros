import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, media, outboxEvents } from '$lib/server/db/schema';
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
		logo_url: z.string().uuid().nullable().optional() // media row id
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
			logo_url: organizations.logo_url
		})
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);

	if (!row) error(404, 'Organization not found.');

	return json({
		data: {
			...row,
			logo_url: await resolveLogoUrl(row.logo_url)
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

	if (input.primary_color !== undefined) {
		if (input.primary_color === null) {
			updates.primary_color = null;
		} else if (!isValidHexColor(input.primary_color)) {
			field_errors.primary_color = 'Must be a hex color like #3b82f6.';
		} else {
			updates.primary_color = normalizeHexColor(input.primary_color);
		}
	}

	if (input.logo_url !== undefined) {
		if (input.logo_url === null) {
			updates.logo_url = null;
		} else {
			const [m] = await db
				.select({ id: media.id, r2_key: media.r2_key })
				.from(media)
				.where(and(eq(media.id, input.logo_url), eq(media.org_id, auth.orgId), isNull(media.deleted_at)))
				.limit(1);
			if (!m) {
				field_errors.logo_url = 'Logo must reference an uploaded media file.';
			} else {
				updates.logo_url = m.r2_key;
			}
		}
	}

	if (Object.keys(field_errors).length > 0) {
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No editable fields provided.' }, { status: 400 });
	}

	updates.updated_at = new Date();

	const logoChanging = 'logo_url' in updates;
	const newLogoKey = (updates.logo_url ?? null) as string | null;

	const returningCols = {
		name: organizations.name,
		trade_type: organizations.trade_type,
		timezone: organizations.timezone,
		address: organizations.address,
		city: organizations.city,
		state: organizations.state,
		zip: organizations.zip,
		primary_color: organizations.primary_color,
		logo_url: organizations.logo_url
	};

	const updated = await db.transaction(async (tx) => {
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
						and(
							eq(media.org_id, auth.orgId),
							eq(media.r2_key, prevKey),
							isNull(media.deleted_at)
						)
					)
					.limit(1);
				prevLogoMedia = row ?? null;
			}
		}

		const [row] = await tx
			.update(organizations)
			.set(updates)
			.where(eq(organizations.id, auth.orgId))
			.returning(returningCols);

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

		return row;
	});

	const resolvedLogo = await resolveLogoUrl(updated.logo_url);

	logChange({
		request_id: crypto.randomUUID(),
		org_id: auth.orgId,
		member_id: auth.member.id,
		route: 'PATCH /api/settings/org',
		changed_fields: Object.keys(updates).filter((k) => k !== 'updated_at')
	});

	return json({ data: { ...updated, logo_url: resolvedLogo } });
};
