import { json, error } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	availabilityOverrides,
	availabilityWindows,
	bookingFormFields,
	bookingLinks
} from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { requireFeature } from '$lib/server/auth/featureGuard';
import { todayInOrgTz } from '$lib/server/booking/timezone/utils';
import { defaultRequestFormFieldRows } from '$lib/server/booking/formFields';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const windowSchema = z.object({
	day_of_week: z.number().int().min(0).max(6),
	start_time: z.string().regex(timeRegex, 'Invalid time (HH:MM).'),
	end_time: z.string().regex(timeRegex, 'Invalid time (HH:MM).')
});

const overrideSchema = z
	.object({
		override_date: z.string().regex(dateRegex, 'Use YYYY-MM-DD.'),
		is_blocked: z.boolean(),
		start_time: z.string().regex(timeRegex).optional().nullable(),
		end_time: z.string().regex(timeRegex).optional().nullable(),
		reason: z.string().trim().max(500).optional().nullable()
	})
	.refine((v) => v.is_blocked || (v.start_time && v.end_time), {
		message: 'Start time and end time are required when not blocking the day.',
		path: ['start_time']
	});

const createSchema = z.object({
	slug: z
		.string()
		.trim()
		.toLowerCase()
		.min(3, 'Slug must be at least 3 characters.')
		.max(60, 'Slug must be 60 characters or fewer.')
		.regex(slugRegex, 'Use lowercase letters, numbers, and hyphens only.'),
	title: z.string().trim().min(1, 'Title is required.').max(120),
	description: z.string().trim().max(2000).optional().nullable(),
	form_type: z.enum(['booking', 'request']).default('booking'),
	requires_approval: z.boolean().default(true),
	appointment_type: z.enum(['estimate', 'job_start', 'follow_up', 'inspection', 'other']),
	slot_duration_minutes: z.union([
		z.literal(30),
		z.literal(45),
		z.literal(60),
		z.literal(90),
		z.literal(120)
	]),
	buffer_minutes: z.union([z.literal(0), z.literal(15), z.literal(30)]),
	min_advance_hours: z.union([z.literal(1), z.literal(4), z.literal(24), z.literal(48)]),
	max_future_days: z.union([z.literal(14), z.literal(30), z.literal(60)]),
	windows: z.array(windowSchema).max(50).optional(),
	overrides: z.array(overrideSchema).max(50).optional()
});

const DEFAULT_WINDOWS = [1, 2, 3, 4, 5].map((dow) => ({
	day_of_week: dow,
	start_time: '08:00:00',
	end_time: '17:00:00'
}));

function toMinutes(t: string): number {
	const [h, m] = t.split(':');
	return Number(h) * 60 + Number(m);
}

function normalizeTime(t: string): string {
	return t.length === 5 ? `${t}:00` : t;
}

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	const rows = await db
		.select({
			id: bookingLinks.id,
			slug: bookingLinks.slug,
			title: bookingLinks.title,
			description: bookingLinks.description,
			form_type: bookingLinks.form_type,
			requires_approval: bookingLinks.requires_approval,
			appointment_type: bookingLinks.appointment_type,
			slot_duration_minutes: bookingLinks.slot_duration_minutes,
			buffer_minutes: bookingLinks.buffer_minutes,
			min_advance_hours: bookingLinks.min_advance_hours,
			max_future_days: bookingLinks.max_future_days,
			is_default: bookingLinks.is_default,
			is_active: bookingLinks.is_active,
			created_at: bookingLinks.created_at,
			window_count: sql<number>`(
				SELECT COUNT(*)::int FROM ${availabilityWindows}
				WHERE ${availabilityWindows.booking_link_id} = ${bookingLinks.id}
			)`,
			override_count: sql<number>`(
				SELECT COUNT(*)::int FROM availability_overrides
				WHERE availability_overrides.booking_link_id = ${bookingLinks.id}
			)`
		})
		.from(bookingLinks)
		.where(and(eq(bookingLinks.org_id, auth.orgId), isNull(bookingLinks.deleted_at)))
		.orderBy(asc(bookingLinks.created_at));

	return json({ data: rows });
};

export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (auth.member.role !== 'admin') error(403, 'Admin only.');
	requireFeature(auth, 'feature_online_booking');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON.' }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path.map((p) => String(p)).join('.');
			if (key && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const input = parsed.data;
	const field_errors: Record<string, string> = {};

	if (input.windows) {
		for (let i = 0; i < input.windows.length; i++) {
			const w = input.windows[i];
			if (toMinutes(w.end_time) <= toMinutes(w.start_time)) {
				field_errors[`windows.${i}.end_time`] = 'End must be after start.';
			}
		}
		if (Object.keys(field_errors).length === 0) {
			const byDay = new Map<number, { start: number; end: number; idx: number }[]>();
			input.windows.forEach((w, idx) => {
				const arr = byDay.get(w.day_of_week) ?? [];
				arr.push({ start: toMinutes(w.start_time), end: toMinutes(w.end_time), idx });
				byDay.set(w.day_of_week, arr);
			});
			for (const list of byDay.values()) {
				list.sort((a, b) => a.start - b.start);
				for (let i = 1; i < list.length; i++) {
					if (list[i].start < list[i - 1].end) {
						field_errors[`windows.${list[i].idx}.start_time`] =
							'Overlaps another window on this day.';
					}
				}
			}
		}
	}

	if (input.overrides) {
		const today = todayInOrgTz(auth.org.timezone);
		const seenDates = new Set<string>();
		for (let i = 0; i < input.overrides.length; i++) {
			const o = input.overrides[i];
			if (o.override_date < today) {
				field_errors[`overrides.${i}.override_date`] = 'Must be today or later.';
			}
			if (seenDates.has(o.override_date)) {
				field_errors[`overrides.${i}.override_date`] = 'Duplicate date.';
			}
			seenDates.add(o.override_date);
			if (!o.is_blocked && o.start_time && o.end_time) {
				if (toMinutes(o.end_time) <= toMinutes(o.start_time)) {
					field_errors[`overrides.${i}.end_time`] = 'End must be after start.';
				}
			}
		}
	}

	if (Object.keys(field_errors).length > 0) {
		return json({ error: 'Validation failed.', field_errors }, { status: 400 });
	}

	const [existing] = await db
		.select({ id: bookingLinks.id })
		.from(bookingLinks)
		.where(
			and(
				eq(bookingLinks.org_id, auth.orgId),
				eq(bookingLinks.slug, input.slug),
				isNull(bookingLinks.deleted_at)
			)
		)
		.limit(1);

	if (existing) {
		return json(
			{
				error: 'A booking link with this slug already exists.',
				field_errors: { slug: 'Already in use.' }
			},
			{ status: 409 }
		);
	}

	const windowsToInsert =
		input.windows === undefined
			? DEFAULT_WINDOWS
			: input.windows.map((w) => ({
					day_of_week: w.day_of_week,
					start_time: normalizeTime(w.start_time),
					end_time: normalizeTime(w.end_time)
				}));

	const created = await db.transaction(async (tx) => {
		const [link] = await tx
			.insert(bookingLinks)
			.values({
				org_id: auth.orgId,
				slug: input.slug,
				title: input.title,
				description: input.description ?? null,
				form_type: input.form_type,
				requires_approval: input.requires_approval,
				appointment_type: input.appointment_type,
				slot_duration_minutes: input.slot_duration_minutes,
				buffer_minutes: input.buffer_minutes,
				min_advance_hours: input.min_advance_hours,
				max_future_days: input.max_future_days,
				is_active: true
			})
			.returning();

		if (windowsToInsert.length > 0) {
			await tx.insert(availabilityWindows).values(
				windowsToInsert.map((w) => ({
					booking_link_id: link.id,
					day_of_week: w.day_of_week,
					start_time: w.start_time,
					end_time: w.end_time
				}))
			);
		}

		if (input.overrides && input.overrides.length > 0) {
			await tx.insert(availabilityOverrides).values(
				input.overrides.map((o) => ({
					booking_link_id: link.id,
					override_date: o.override_date,
					is_blocked: o.is_blocked,
					start_time: o.is_blocked ? null : normalizeTime(o.start_time!),
					end_time: o.is_blocked ? null : normalizeTime(o.end_time!),
					reason: o.reason ?? null
				}))
			);
		}

		// Request forms get the default standardized field set so the builder has
		// rows to manage (R5.2). Booking forms have no builder yet.
		if (link.form_type === 'request') {
			await tx.insert(bookingFormFields).values(defaultRequestFormFieldRows(auth.orgId, link.id));
		}

		return link;
	});

	return json({ data: created }, { status: 201 });
};
