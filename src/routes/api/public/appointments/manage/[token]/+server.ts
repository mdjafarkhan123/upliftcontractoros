// Public manage endpoint for customer self-serve reschedule/cancel.
// No session — the signed token IS the auth.
//
// 404 strategy: ALL invalid/expired/stale/missing token states return a generic
// 404. Never disclose appointment existence. Even "appointment already
// cancelled" returns 404 to avoid enumeration.

import { json } from '@sveltejs/kit';
import { addMinutes } from 'date-fns';
import { and, eq, gte, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointmentAssignees,
	appointments,
	activityEvents,
	bookingLinks,
	contacts,
	organizations,
	outboxEvents,
	type Appointment
} from '$lib/server/db/schema';
import { generateSlotsForDate, BookingValidationError } from '$lib/server/booking';
import {
	assertIsoDate,
	startOfLocalDayUtc,
	startOfNextLocalDayUtc
} from '$lib/server/booking/timezone/utils';
import {
	checkIpRateLimit,
	checkManageTokenRateLimit,
	extractClientIp
} from '$lib/server/booking/rateLimit';
import {
	appointmentUpdatedAtEpoch,
	manageTokenExpiry,
	sign,
	verify,
	type ManageTokenPayload
} from '$lib/server/tokens/appointmentManageToken';

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): Response {
	return json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
}

function tooMany(retryAfter?: number): Response {
	return json(
		{ error: 'Too many requests. Please try again shortly.' },
		{
			status: 429,
			headers: {
				...NO_STORE,
				...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
			}
		}
	);
}

interface ResolvedAppointment {
	appointment: Appointment;
	org_id: string;
	org_slug: string;
	org_name: string;
	org_timezone: string;
	contact_first_name: string;
	booking_link: {
		id: string;
		slug: string;
		slot_duration_minutes: number;
		buffer_minutes: number;
		min_advance_hours: number;
		max_future_days: number;
	} | null;
}

// Resolves the appointment for a token. Returns null on any failure mode the
// route maps to a generic 404: bad token, expired, stale updated_at, soft
// deleted, not scheduled, org inactive/deleted.
async function resolveAppointment(
	payload: ManageTokenPayload
): Promise<ResolvedAppointment | null> {
	const [row] = await db
		.select({
			appointment: appointments,
			org_slug: organizations.slug,
			org_name: organizations.name,
			org_timezone: organizations.timezone,
			org_status: organizations.status,
			org_deleted_at: organizations.deleted_at,
			contact_full_name: contacts.full_name
		})
		.from(appointments)
		.innerJoin(organizations, eq(organizations.id, appointments.org_id))
		.innerJoin(contacts, eq(contacts.id, appointments.contact_id))
		.where(eq(appointments.id, payload.appointmentId))
		.limit(1);

	if (!row) return null;
	if (row.org_status !== 'active' || row.org_deleted_at) return null;

	const appt = row.appointment;
	if (appt.deleted_at) return null;
	if (appt.status !== 'scheduled') return null;

	if (appointmentUpdatedAtEpoch(appt.updated_at) !== payload.updatedAtEpoch) return null;

	let bookingLink: ResolvedAppointment['booking_link'] = null;
	if (appt.booked_via_link_id) {
		const [link] = await db
			.select({
				id: bookingLinks.id,
				slug: bookingLinks.slug,
				slot_duration_minutes: bookingLinks.slot_duration_minutes,
				buffer_minutes: bookingLinks.buffer_minutes,
				min_advance_hours: bookingLinks.min_advance_hours,
				max_future_days: bookingLinks.max_future_days,
				is_active: bookingLinks.is_active,
				deleted_at: bookingLinks.deleted_at
			})
			.from(bookingLinks)
			.where(eq(bookingLinks.id, appt.booked_via_link_id))
			.limit(1);
		if (link && link.is_active && !link.deleted_at) {
			bookingLink = {
				id: link.id,
				slug: link.slug,
				slot_duration_minutes: link.slot_duration_minutes,
				buffer_minutes: link.buffer_minutes,
				min_advance_hours: link.min_advance_hours,
				max_future_days: link.max_future_days
			};
		}
	}

	const firstName = (row.contact_full_name ?? '').trim().split(/\s+/)[0] ?? '';

	return {
		appointment: appt,
		org_id: appt.org_id,
		org_slug: row.org_slug,
		org_name: row.org_name,
		org_timezone: row.org_timezone,
		contact_first_name: firstName,
		booking_link: bookingLink
	};
}

function sanitize(view: ResolvedAppointment): Record<string, unknown> {
	const a = view.appointment;
	return {
		org_name: view.org_name,
		org_timezone: view.org_timezone,
		contact_first_name: view.contact_first_name,
		type: a.type,
		title: a.title,
		// Non-null: manage tokens are only issued for dated booking-link appointments.
		scheduled_start: a.scheduled_start!.toISOString(),
		scheduled_end: a.scheduled_end ? a.scheduled_end.toISOString() : null,
		location: a.location,
		can_reschedule: view.booking_link !== null,
		// Only exposed when a booking link exists. The customer already knew
		// these (they used /book/{org_slug}/{booking_slug} to book) — surfacing
		// them here lets the manage page reuse the existing public dates/slots
		// endpoints unchanged.
		org_slug: view.booking_link ? view.org_slug : null,
		booking_slug: view.booking_link ? view.booking_link.slug : null,
		slot_duration_minutes: view.booking_link ? view.booking_link.slot_duration_minutes : null
	};
}

async function applyRateLimits(token: string, request: Request): Promise<Response | null> {
	const ipCheck = await checkIpRateLimit(extractClientIp(request));
	if (!ipCheck.allowed) return tooMany(ipCheck.retryAfterSeconds);
	const tokenCheck = await checkManageTokenRateLimit(token);
	if (!tokenCheck.allowed) return tooMany(tokenCheck.retryAfterSeconds);
	return null;
}

export const GET: RequestHandler = async ({ params, request }) => {
	const token = params.token!;
	const limited = await applyRateLimits(token, request);
	if (limited) return limited;

	const payload = verify(token);
	if (!payload) return notFound();

	const resolved = await resolveAppointment(payload);
	if (!resolved) return notFound();

	return json({ data: sanitize(resolved) }, { headers: NO_STORE });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const token = params.token!;
	const limited = await applyRateLimits(token, request);
	if (limited) return limited;

	const payload = verify(token);
	if (!payload) return notFound();

	let raw: { scheduled_start?: unknown };
	try {
		raw = (await request.json()) as { scheduled_start?: unknown };
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
	}
	if (typeof raw.scheduled_start !== 'string') {
		return json(
			{ error: 'scheduled_start is required', field_errors: { scheduled_start: 'Required' } },
			{ status: 422, headers: NO_STORE }
		);
	}
	const newStart = new Date(raw.scheduled_start);
	if (isNaN(newStart.getTime())) {
		return json(
			{ error: 'Invalid slot timestamp', field_errors: { scheduled_start: 'Invalid' } },
			{ status: 400, headers: NO_STORE }
		);
	}

	const resolved = await resolveAppointment(payload);
	if (!resolved) return notFound();
	if (!resolved.booking_link) {
		// Internal appointments can only be cancelled via this link, not
		// rescheduled — there is no booking-link availability config to gate it.
		return json(
			{ error: 'This appointment cannot be rescheduled online. Please contact us directly.' },
			{ status: 422, headers: NO_STORE }
		);
	}

	const orgId = resolved.org_id;
	const link = resolved.booking_link;
	const tz = resolved.org_timezone;

	// Derive the YYYY-MM-DD (in org tz) for the new slot to run availability.
	const dateInTz = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(newStart);

	let date: string;
	try {
		date = assertIsoDate(dateInTz);
	} catch {
		return json({ error: 'Invalid date' }, { status: 400, headers: NO_STORE });
	}

	let availableSlots: Date[];
	try {
		availableSlots = await generateSlotsForDate({
			orgId,
			timezone: tz,
			bookingLink: link,
			date
		});
	} catch (err) {
		if (err instanceof BookingValidationError) {
			return json({ error: err.message }, { status: 400, headers: NO_STORE });
		}
		throw err;
	}

	const slotMs = newStart.getTime();
	const slotMatch = availableSlots.find((s) => s.getTime() === slotMs);
	if (!slotMatch) {
		return json(
			{ error: 'This time slot is no longer available. Please select another time.' },
			{ status: 409, headers: NO_STORE }
		);
	}

	const newEnd = addMinutes(slotMatch, link.slot_duration_minutes);

	// Conflict check + transactional update.
	const txResult = await db.transaction(async (tx) => {
		// Re-lock the appointment in the transaction. The token's updated_at
		// epoch must still match — guards against a concurrent contractor edit.
		const lockRows = await tx.execute<Appointment>(sql`
			SELECT * FROM appointments
			WHERE id = ${payload.appointmentId}
				AND org_id = ${orgId}
				AND deleted_at IS NULL
			FOR UPDATE
		`);
		const current = (lockRows as unknown as Appointment[])[0];
		if (!current) return { kind: 'notFound' as const };
		if (current.status !== 'scheduled') return { kind: 'notFound' as const };
		if (appointmentUpdatedAtEpoch(current.updated_at) !== payload.updatedAtEpoch) {
			return { kind: 'stale' as const };
		}

		// Lock the day's appointments and re-verify no overlap (excluding self).
		const dayStartUtc = startOfLocalDayUtc(date, tz);
		const nextDayStartUtc = startOfNextLocalDayUtc(date, tz);
		const fetchStart = addMinutes(dayStartUtc, -24 * 60);
		const existing = await tx
			.select({
				id: appointments.id,
				scheduled_start: appointments.scheduled_start,
				scheduled_end: appointments.scheduled_end
			})
			.from(appointments)
			.where(
				and(
					eq(appointments.org_id, orgId),
					gte(appointments.scheduled_start, fetchStart),
					lt(appointments.scheduled_start, nextDayStartUtc),
					notInArray(appointments.status, ['cancelled', 'no_show']),
					isNull(appointments.deleted_at)
				)
			)
			.for('update');

		const slotDurMs = link.slot_duration_minutes * 60_000;
		const bufferMs = Math.max(0, link.buffer_minutes) * 60_000;
		const cStart = slotMatch.getTime();
		const cEnd = cStart + slotDurMs;
		for (const a of existing) {
			if (a.id === payload.appointmentId) continue;
			// Non-null: `existing` is filtered to a date window, excluding unscheduled visits.
			const bStart = a.scheduled_start!.getTime();
			const bEnd = (a.scheduled_end ? a.scheduled_end.getTime() : bStart + slotDurMs) + bufferMs;
			if (cStart < bEnd && cEnd > bStart) {
				return { kind: 'conflict' as const };
			}
		}

		const now = new Date();
		// Non-null: a booking-link appointment being rescheduled always has a prior date.
		const oldStart = current.scheduled_start!;
		const [updated] = await tx
			.update(appointments)
			.set({
				scheduled_start: slotMatch,
				scheduled_end: newEnd,
				reminder_24h_sent: false,
				reminder_1h_sent: false,
				updated_at: now
			})
			.where(eq(appointments.id, payload.appointmentId))
			.returning();

		// Preserve the full crew on the outbox payload — Phase 3 multi-assignee.
		const crewRows = await tx
			.select({ id: appointmentAssignees.member_id })
			.from(appointmentAssignees)
			.where(eq(appointmentAssignees.appointment_id, payload.appointmentId));
		const assigneeIds = crewRows.map((r) => r.id);

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'appointment.rescheduled',
			resource_type: 'appointment',
			resource_id: updated.id,
			payload: {
				appointment_id: updated.id,
				org_id: orgId,
				contact_id: updated.contact_id,
				job_id: updated.job_id,
				assigned_to: updated.assigned_to,
				assignee_ids: assigneeIds,
				old_start_at: oldStart.toISOString(),
				new_start_at: updated.scheduled_start!.toISOString(),
				reminder_flags_reset: true,
				source: 'customer_self_serve'
			},
			idempotency_key: `appointment.rescheduled:${updated.id}:${updated.scheduled_start!.toISOString()}`
		});

		await tx.insert(activityEvents).values({
			org_id: orgId,
			event_type: 'appointment_modified_by_customer',
			resource_type: 'appointment',
			resource_id: updated.id,
			contact_id: updated.contact_id,
			payload: {
				action: 'rescheduled',
				previous_start_at: oldStart.toISOString(),
				new_start_at: updated.scheduled_start!.toISOString()
			},
			occurred_at: now
		});

		return { kind: 'ok' as const, row: updated };
	});

	if (txResult.kind === 'notFound') return notFound();
	if (txResult.kind === 'stale') return notFound();
	if (txResult.kind === 'conflict') {
		return json(
			{ error: 'This time slot is no longer available. Please select another time.' },
			{ status: 409, headers: NO_STORE }
		);
	}

	// Issue a fresh token bound to the new updated_at so the customer can
	// manage again from the same page without bouncing through email.
	const newToken = sign({
		appointmentId: txResult.row.id,
		updatedAtEpoch: appointmentUpdatedAtEpoch(txResult.row.updated_at),
		exp: manageTokenExpiry(txResult.row.scheduled_start!)
	});

	const refreshed = await resolveAppointment({
		appointmentId: txResult.row.id,
		updatedAtEpoch: appointmentUpdatedAtEpoch(txResult.row.updated_at),
		exp: manageTokenExpiry(txResult.row.scheduled_start!)
	});
	if (!refreshed) return notFound();

	return json({ data: { ...sanitize(refreshed), token: newToken } }, { headers: NO_STORE });
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	const token = params.token!;
	const limited = await applyRateLimits(token, request);
	if (limited) return limited;

	const payload = verify(token);
	if (!payload) return notFound();

	const resolved = await resolveAppointment(payload);
	if (!resolved) return notFound();
	const orgId = resolved.org_id;

	const result = await db.transaction(async (tx) => {
		const lockRows = await tx.execute<Appointment>(sql`
			SELECT * FROM appointments
			WHERE id = ${payload.appointmentId}
				AND org_id = ${orgId}
				AND deleted_at IS NULL
			FOR UPDATE
		`);
		const current = (lockRows as unknown as Appointment[])[0];
		if (!current) return { kind: 'notFound' as const };
		if (current.status !== 'scheduled') return { kind: 'notFound' as const };
		if (appointmentUpdatedAtEpoch(current.updated_at) !== payload.updatedAtEpoch) {
			return { kind: 'stale' as const };
		}

		const now = new Date();
		const [updated] = await tx
			.update(appointments)
			.set({ status: 'cancelled', cancelled_at: now, updated_at: now })
			.where(eq(appointments.id, payload.appointmentId))
			.returning();

		await tx.insert(outboxEvents).values({
			org_id: orgId,
			event_type: 'appointment.cancelled',
			resource_type: 'appointment',
			resource_id: updated.id,
			payload: {
				appointment_id: updated.id,
				org_id: orgId,
				contact_id: updated.contact_id,
				job_id: updated.job_id,
				assigned_to: updated.assigned_to,
				transitioned_at: now.toISOString(),
				source: 'customer_self_serve'
			},
			idempotency_key: `appointment.cancelled:${updated.id}`
		});

		await tx.insert(activityEvents).values({
			org_id: orgId,
			event_type: 'appointment_modified_by_customer',
			resource_type: 'appointment',
			resource_id: updated.id,
			contact_id: updated.contact_id,
			payload: {
				action: 'cancelled',
				previous_start_at: current.scheduled_start!.toISOString()
			},
			occurred_at: now
		});

		return { kind: 'ok' as const };
	});

	if (result.kind === 'notFound') return notFound();
	if (result.kind === 'stale') return notFound();

	return new Response(null, { status: 204, headers: NO_STORE });
};
