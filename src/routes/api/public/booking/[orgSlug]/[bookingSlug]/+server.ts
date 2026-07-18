// Public booking page config + submission endpoint. No session required.
// Engine is stateless; this route performs fresh DB reads each call and never caches.
//
// 404 strategy: ALL unavailable/suspended/disabled/deleted/invalid-slug states
// return a generic 404. Never expose org existence vs feature-flag state vs
// suspension — anonymous callers must not be able to enumerate orgs.

import { json } from '@sveltejs/kit';
import { addMinutes } from 'date-fns';
import { and, asc, eq, gte, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	bookingFormFields,
	bookingLinks,
	contacts,
	opportunities,
	organizations,
	outboxEvents,
	pipelineStages
} from '$lib/server/db/schema';
import { generateSlotsForDate, BookingValidationError } from '$lib/server/booking';
import { toStandardFieldConfigs, toPublicCustomFields } from '$lib/server/booking/formFields';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import {
	assertIsoDate,
	startOfLocalDayUtc,
	startOfNextLocalDayUtc
} from '$lib/server/booking/timezone/utils';
import {
	checkIpRateLimit,
	extractClientIp,
	isPhoneOnCooldown,
	setPhoneCooldown
} from '$lib/server/booking/rateLimit';
import { submitBookingSchema } from '$lib/server/booking/submitSchema';
import { PhoneInvalidError, toE164 } from '$lib/utils/phone';

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): Response {
	return json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
}

interface LinkLookup {
	link_id: string;
	org_id: string;
	timezone: string;
	title: string;
	appointment_type: 'estimate' | 'job_start' | 'follow_up' | 'inspection' | 'other';
	slot_duration_minutes: number;
	buffer_minutes: number;
	min_advance_hours: number;
	max_future_days: number;
	org_name: string;
}

// Single canonical lookup used by GET and POST. Filters every safety condition
// (org active, not deleted, feature flag, link active, not deleted). Any miss
// returns null — callers map this to a generic 404.
async function findActiveBookingLink(
	orgSlug: string,
	bookingSlug: string
): Promise<LinkLookup | null> {
	const [row] = await db
		.select({
			link_id: bookingLinks.id,
			org_id: bookingLinks.org_id,
			timezone: organizations.timezone,
			title: bookingLinks.title,
			appointment_type: bookingLinks.appointment_type,
			slot_duration_minutes: bookingLinks.slot_duration_minutes,
			buffer_minutes: bookingLinks.buffer_minutes,
			min_advance_hours: bookingLinks.min_advance_hours,
			max_future_days: bookingLinks.max_future_days,
			org_name: organizations.name
		})
		.from(bookingLinks)
		.innerJoin(organizations, eq(organizations.id, bookingLinks.org_id))
		.where(
			and(
				eq(organizations.slug, orgSlug),
				eq(organizations.status, 'active'),
				sql`${organizations.deleted_at} IS NULL`,
				eq(organizations.feature_online_booking, true),
				eq(bookingLinks.slug, bookingSlug),
				// Booking submissions only — a request-form slug must go through
				// /submit-request (which creates a Request, not a direct appointment).
				eq(bookingLinks.form_type, 'booking'),
				eq(bookingLinks.is_active, true),
				sql`${bookingLinks.deleted_at} IS NULL`
			)
		)
		.limit(1);

	return row ?? null;
}

export const GET: RequestHandler = async ({ params }) => {
	const orgSlug = params.orgSlug!;
	const bookingSlug = params.bookingSlug!;

	const [row] = await db
		.select({
			link_id: bookingLinks.id,
			org_name: organizations.name,
			org_logo_url: organizations.logo_url,
			org_timezone: organizations.timezone,
			org_country: organizations.country,
			title: bookingLinks.title,
			description: bookingLinks.description,
			form_type: bookingLinks.form_type,
			requires_approval: bookingLinks.requires_approval,
			appointment_type: bookingLinks.appointment_type,
			slot_duration_minutes: bookingLinks.slot_duration_minutes
		})
		.from(bookingLinks)
		.innerJoin(organizations, eq(organizations.id, bookingLinks.org_id))
		.where(
			and(
				eq(organizations.slug, orgSlug),
				eq(organizations.status, 'active'),
				sql`${organizations.deleted_at} IS NULL`,
				eq(organizations.feature_online_booking, true),
				eq(bookingLinks.slug, bookingSlug),
				eq(bookingLinks.is_active, true),
				sql`${bookingLinks.deleted_at} IS NULL`
			)
		)
		.limit(1);

	if (!row) return notFound();

	// Request forms carry a per-field config (R5.2) that drives which sections the
	// wizard shows/requires. Only fetched for request forms (a dependent read: it
	// needs the resolved link id). Presigned logo resolves in parallel with it.
	const [resolvedLogoUrl, fieldRows] = await Promise.all([
		resolveLogoUrl(row.org_logo_url),
		row.form_type === 'request'
			? db
					.select()
					.from(bookingFormFields)
					.where(eq(bookingFormFields.booking_link_id, row.link_id))
					.orderBy(asc(bookingFormFields.position))
			: Promise.resolve([])
	]);

	return json(
		{
			data: {
				org_name: row.org_name,
				org_logo_url: resolvedLogoUrl,
				org_timezone: row.org_timezone,
				org_country: row.org_country,
				title: row.title,
				description: row.description,
				form_type: row.form_type,
				requires_approval: row.requires_approval,
				appointment_type: row.appointment_type,
				slot_duration_minutes: row.slot_duration_minutes,
				fields: toStandardFieldConfigs(fieldRows),
				custom_fields: toPublicCustomFields(fieldRows)
			}
		},
		{ headers: NO_STORE }
	);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const orgSlug = params.orgSlug!;
	const bookingSlug = params.bookingSlug!;

	// 1. Parse body
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
	}
	const parsed = submitBookingSchema.safeParse(raw);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const path = issue.path.join('.');
			if (path && !field_errors[path]) field_errors[path] = issue.message;
		}
		return json(
			{ error: parsed.error.issues[0]?.message ?? 'Invalid input', field_errors },
			{ status: 422, headers: NO_STORE }
		);
	}
	const input = parsed.data;

	// 2. Honeypot — silent 200, no DB work, no rate-limit consumption.
	if (input.website && input.website.trim() !== '') {
		return json({ data: { ok: true } }, { status: 200, headers: NO_STORE });
	}

	// 3. IP rate limit (fail-open)
	const ip = extractClientIp(request);
	const ipCheck = await checkIpRateLimit(ip);
	if (!ipCheck.allowed) {
		return json(
			{ error: 'Too many booking attempts. Please try again later.' },
			{
				status: 429,
				headers: {
					...NO_STORE,
					...(ipCheck.retryAfterSeconds ? { 'Retry-After': String(ipCheck.retryAfterSeconds) } : {})
				}
			}
		);
	}

	// 4. Phone normalization (do BEFORE phone cooldown check so the key matches)
	let e164: string;
	try {
		e164 = toE164(input.customerPhone);
	} catch (err) {
		if (err instanceof PhoneInvalidError) {
			return json(
				{ error: err.message, field_errors: { customerPhone: err.message } },
				{ status: 422, headers: NO_STORE }
			);
		}
		throw err;
	}

	// 5. Phone cooldown
	if (await isPhoneOnCooldown(e164)) {
		return json(
			{
				error:
					'A booking was recently submitted for this phone number. Please wait before trying again.'
			},
			{ status: 429, headers: NO_STORE }
		);
	}

	// 6. Resolve booking link (generic 404 hides any unavailable state)
	const link = await findActiveBookingLink(orgSlug, bookingSlug);
	if (!link) return notFound();

	// 7. Date format check
	let date: string;
	try {
		date = assertIsoDate(input.date);
	} catch (err) {
		if (err instanceof BookingValidationError) {
			return json(
				{ error: err.message, field_errors: { date: err.message } },
				{ status: 400, headers: NO_STORE }
			);
		}
		throw err;
	}

	// 8. Slot timestamp parse
	const slotStartDate = new Date(input.slotStart);
	if (isNaN(slotStartDate.getTime())) {
		return json(
			{ error: 'Invalid slot timestamp', field_errors: { slotStart: 'Invalid' } },
			{ status: 400, headers: NO_STORE }
		);
	}

	// 9. Re-run Tier 2 availability for the requested date. If the requested
	//    slotStart isn't in the returned set, it's no longer bookable.
	let availableSlots: Date[];
	try {
		availableSlots = await generateSlotsForDate({
			orgId: link.org_id,
			timezone: link.timezone,
			bookingLink: {
				id: link.link_id,
				slot_duration_minutes: link.slot_duration_minutes,
				buffer_minutes: link.buffer_minutes,
				min_advance_hours: link.min_advance_hours,
				max_future_days: link.max_future_days
			},
			date
		});
	} catch (err) {
		if (err instanceof BookingValidationError) {
			return json(
				{ error: err.message, field_errors: err.field ? { [err.field]: err.message } : undefined },
				{ status: 400, headers: NO_STORE }
			);
		}
		throw err;
	}

	const slotMs = slotStartDate.getTime();
	const slotMatch = availableSlots.find((s) => s.getTime() === slotMs);
	if (!slotMatch) {
		return json(
			{ error: 'This time slot is no longer available. Please select another time.' },
			{ status: 409, headers: NO_STORE }
		);
	}

	const slotEndDate = addMinutes(slotMatch, link.slot_duration_minutes);

	// 10. Transaction — lock, re-check conflict, contact upsert, opportunity,
	//     appointment, outbox events. All-or-nothing.
	let txResult:
		| {
				ok: true;
				appointmentId: string;
				scheduledStart: Date;
				orgName: string;
				bookingTitle: string;
		  }
		| { ok: false; status: number; error: string };
	try {
		txResult = await db.transaction(async (tx) => {
			// 10a. Pipeline entry stage. Booking-link deals enter at the "Scheduled"
			// column (3rd position, index 2) — the appointment is already on the
			// calendar, so they skip New Lead + Contacted (industry pattern; matches
			// the pipeline auto-advance ratchet). Clamps to the last column for orgs
			// with fewer stages.
			const stageRows = await tx
				.select({ id: pipelineStages.id })
				.from(pipelineStages)
				.where(
					and(eq(pipelineStages.org_id, link.org_id), sql`${pipelineStages.deleted_at} IS NULL`)
				)
				.orderBy(asc(pipelineStages.position));

			const defaultStage = stageRows[Math.min(2, stageRows.length - 1)];

			if (!defaultStage) {
				return {
					ok: false as const,
					status: 500,
					error: 'Booking is temporarily unavailable.'
				};
			}

			// 10b. Lock conflicting rows in the date window with FOR UPDATE and
			//      re-run conflict detection in-process. Locking holds these rows
			//      stable for the rest of the transaction so a parallel booking
			//      cannot claim the same slot.
			const dayStartUtc = startOfLocalDayUtc(date, link.timezone);
			const nextDayStartUtc = startOfNextLocalDayUtc(date, link.timezone);
			const fetchStart = addMinutes(dayStartUtc, -24 * 60);

			const existing = await tx
				.select({
					scheduled_start: appointments.scheduled_start,
					scheduled_end: appointments.scheduled_end
				})
				.from(appointments)
				.where(
					and(
						eq(appointments.org_id, link.org_id),
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
				// Non-null: `existing` is filtered to a date window, excluding unscheduled visits.
				const bStart = a.scheduled_start!.getTime();
				const bEnd = (a.scheduled_end ? a.scheduled_end.getTime() : bStart + slotDurMs) + bufferMs;
				if (cStart < bEnd && cEnd > bStart) {
					return {
						ok: false as const,
						status: 409,
						error: 'This time slot is no longer available. Please select another time.'
					};
				}
			}

			// 10c. Contact upsert by (org_id, phone). Soft-deleted rows are skipped.
			let contactId: string;
			let contactCreated = false;
			const [existingContact] = await tx
				.select({ id: contacts.id })
				.from(contacts)
				.where(
					and(
						eq(contacts.org_id, link.org_id),
						eq(contacts.phone, e164),
						isNull(contacts.deleted_at)
					)
				)
				.limit(1);

			if (existingContact) {
				contactId = existingContact.id;
			} else {
				const [insertedContact] = await tx
					.insert(contacts)
					.values({
						org_id: link.org_id,
						full_name: input.customerName.trim(),
						phone: e164,
						email: input.customerEmail ?? null,
						status: 'lead',
						lead_source: 'other'
					})
					.returning({
						id: contacts.id,
						full_name: contacts.full_name,
						phone: contacts.phone,
						email: contacts.email,
						lead_source: contacts.lead_source,
						assigned_to: contacts.assigned_to
					});
				contactId = insertedContact.id;
				contactCreated = true;

				await tx.insert(outboxEvents).values({
					org_id: link.org_id,
					event_type: 'contact.created',
					resource_type: 'contact',
					resource_id: insertedContact.id,
					payload: {
						contact_id: insertedContact.id,
						org_id: link.org_id,
						full_name: insertedContact.full_name,
						phone: insertedContact.phone,
						email: insertedContact.email,
						lead_source: insertedContact.lead_source,
						assigned_to: insertedContact.assigned_to
					},
					idempotency_key: `contact.created:${insertedContact.id}`
				});
			}

			// 10d. Opportunity
			const opportunityTitle = `${link.title} — ${input.customerName.trim()}`;
			const [insertedOpp] = await tx
				.insert(opportunities)
				.values({
					org_id: link.org_id,
					contact_id: contactId,
					stage_id: defaultStage.id,
					title: opportunityTitle,
					value: null,
					assigned_to: null
				})
				.returning({ id: opportunities.id });

			await tx.insert(outboxEvents).values({
				org_id: link.org_id,
				event_type: 'opportunity.created',
				resource_type: 'opportunity',
				resource_id: insertedOpp.id,
				payload: {
					event_version: 1,
					opportunity_id: insertedOpp.id,
					org_id: link.org_id,
					contact_id: contactId,
					stage_id: defaultStage.id,
					title: opportunityTitle,
					value: null,
					assigned_to: null
				},
				idempotency_key: `opportunity.created:${insertedOpp.id}`
			});

			// 10e. Appointment
			const [insertedAppt] = await tx
				.insert(appointments)
				.values({
					org_id: link.org_id,
					contact_id: contactId,
					job_id: null,
					assigned_to: null,
					type: link.appointment_type,
					status: 'scheduled',
					title: link.title,
					scheduled_start: slotMatch,
					scheduled_end: slotEndDate,
					location: null,
					booking_source: 'booking_link',
					booked_via_link_id: link.link_id,
					customer_name: input.customerName.trim(),
					customer_phone: e164,
					customer_email: input.customerEmail ?? null,
					customer_notes: input.notes ?? null,
					booking_referrer: input.source ?? null,
					reminder_24h_sent: false,
					reminder_1h_sent: false
				})
				.returning({
					id: appointments.id,
					scheduled_start: appointments.scheduled_start
				});

			await tx.insert(outboxEvents).values({
				org_id: link.org_id,
				event_type: 'appointment.created',
				resource_type: 'appointment',
				resource_id: insertedAppt.id,
				payload: {
					appointment_id: insertedAppt.id,
					org_id: link.org_id,
					contact_id: contactId,
					job_id: null,
					assigned_to: null,
					scheduled_start: insertedAppt.scheduled_start!.toISOString(),
					scheduled_end: slotEndDate.toISOString(),
					source: 'booking_link',
					booking_referrer: input.source ?? null,
					contact_created: contactCreated
				},
				idempotency_key: `appointment.created:${insertedAppt.id}`
			});

			return {
				ok: true as const,
				appointmentId: insertedAppt.id,
				// Non-null: a booking-link appointment is always created with a concrete slot.
				scheduledStart: insertedAppt.scheduled_start!,
				orgName: link.org_name,
				bookingTitle: link.title
			};
		});
	} catch (err) {
		console.error('[booking submit] transaction failed:', err);
		return json(
			{ error: 'Could not complete booking. Please try again.' },
			{ status: 500, headers: NO_STORE }
		);
	}

	if (!txResult.ok) {
		return json({ error: txResult.error }, { status: txResult.status, headers: NO_STORE });
	}

	// 11. Post-transaction: set phone cooldown (fail-open).
	await setPhoneCooldown(e164);

	return json(
		{
			data: {
				appointmentId: txResult.appointmentId,
				scheduledStart: txResult.scheduledStart.toISOString(),
				orgName: txResult.orgName,
				bookingTitle: txResult.bookingTitle
			}
		},
		{ status: 201, headers: NO_STORE }
	);
};
