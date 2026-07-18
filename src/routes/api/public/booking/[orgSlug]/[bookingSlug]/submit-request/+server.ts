// Public REQUEST-form submission endpoint (R4). No session required.
//
// A request form (booking_links.form_type = 'request') collects the client's
// contact info + consents, the property address, a description of the work, the
// "how did you hear about us" answer, and a PREFERRED time slot. On submit we
// create — in ONE transaction — the client (deduped, as a lead), the property
// address, the Request (domain 19), and its on-site assessment appointment at the
// chosen slot. If the form's approval gate is ON the request lands as 'pending'
// (Needs approval) with the slot held; OFF ⇒ 'not_required' (auto-approved).
//
// Photos are NOT handled here — public photo upload is R4.2.
//
// 404 strategy mirrors the booking endpoint: ANY unavailable/disabled/wrong-type
// state returns a generic 404 so anonymous callers cannot enumerate orgs or form
// types.

import { json } from '@sveltejs/kit';
import { addMinutes } from 'date-fns';
import { and, eq, gte, ilike, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	appointments,
	bookingFormFields,
	bookingLinks,
	contactAddresses,
	contacts,
	organizations,
	outboxEvents,
	requestFieldAnswers,
	requests
} from '$lib/server/db/schema';
import { toStandardFieldConfigs, toPublicCustomFields } from '$lib/server/booking/formFields';
import { fieldConfig, customTypeIsMulti } from '$lib/types/bookingForms';
import { generateSlotsForDate, BookingValidationError } from '$lib/server/booking';
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
import { submitRequestSchema } from '$lib/server/requests/publicSubmitSchema';
import { PhoneInvalidError, toE164 } from '$lib/utils/phone';

const NO_STORE = { 'Cache-Control': 'no-store' };

function notFound(): Response {
	return json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
}

interface RequestLinkLookup {
	link_id: string;
	org_id: string;
	timezone: string;
	title: string;
	requires_approval: boolean;
	slot_duration_minutes: number;
	buffer_minutes: number;
	min_advance_hours: number;
	max_future_days: number;
}

// Canonical lookup: only an ACTIVE, non-deleted REQUEST form on an active,
// booking-enabled org. Any miss → generic 404.
async function findActiveRequestLink(
	orgSlug: string,
	bookingSlug: string
): Promise<RequestLinkLookup | null> {
	const [row] = await db
		.select({
			link_id: bookingLinks.id,
			org_id: bookingLinks.org_id,
			timezone: organizations.timezone,
			title: bookingLinks.title,
			requires_approval: bookingLinks.requires_approval,
			slot_duration_minutes: bookingLinks.slot_duration_minutes,
			buffer_minutes: bookingLinks.buffer_minutes,
			min_advance_hours: bookingLinks.min_advance_hours,
			max_future_days: bookingLinks.max_future_days
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
				eq(bookingLinks.form_type, 'request'),
				eq(bookingLinks.is_active, true),
				sql`${bookingLinks.deleted_at} IS NULL`
			)
		)
		.limit(1);

	return row ?? null;
}

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
	const parsed = submitRequestSchema.safeParse(raw);
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
			{ error: 'Too many submissions. Please try again later.' },
			{
				status: 429,
				headers: {
					...NO_STORE,
					...(ipCheck.retryAfterSeconds ? { 'Retry-After': String(ipCheck.retryAfterSeconds) } : {})
				}
			}
		);
	}

	// 4. Phone normalization (BEFORE cooldown check so the key matches)
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
					'A request was recently submitted for this phone number. Please wait before trying again.'
			},
			{ status: 429, headers: NO_STORE }
		);
	}

	// 6. Resolve request form (generic 404 hides any unavailable state / wrong type)
	const link = await findActiveRequestLink(orgSlug, bookingSlug);
	if (!link) return notFound();

	// 6b. Field config (R5.2). Which optional fields this form shows/requires. The
	//     client wizard obeys it, but we RE-ENFORCE here: require configured-required
	//     fields, and drop data for hidden fields (never persist a field the form
	//     doesn't show). firstName/lastName/phone/serviceDetails are always required
	//     (schema-enforced above); only the configurable ones are checked here.
	const fieldRows = await db
		.select()
		.from(bookingFormFields)
		.where(eq(bookingFormFields.booking_link_id, link.link_id));
	const cfgs = toStandardFieldConfigs(fieldRows);
	const addressCfg = fieldConfig(cfgs, 'address');
	const emailCfg = fieldConfig(cfgs, 'email');
	const companyCfg = fieldConfig(cfgs, 'company_name');
	const leadCfg = fieldConfig(cfgs, 'lead_source');

	const cfgErrors: Record<string, string> = {};
	if (addressCfg.enabled && addressCfg.required) {
		if (!input.addressLine1) cfgErrors.addressLine1 = 'Required';
		if (!input.city) cfgErrors.city = 'Required';
		if (!input.state) cfgErrors.state = 'Required';
		if (!input.zip) cfgErrors.zip = 'Required';
	}
	if (emailCfg.enabled && emailCfg.required && !input.email) cfgErrors.email = 'Required';
	if (companyCfg.enabled && companyCfg.required && !input.companyName)
		cfgErrors.companyName = 'Required';
	if (leadCfg.enabled && leadCfg.required && !input.leadSourceAnswer)
		cfgErrors.leadSourceAnswer = 'Required';

	// Custom questions (R5.2b). Validate answers against the form's ENABLED custom
	// rows; drop answers for unknown/disabled questions (never trust the client).
	// Required-but-empty → a field error keyed `custom_<id>` (the wizard maps these
	// back to the right question). Snapshot rows are built here, inserted in the txn.
	const publicCustomFields = toPublicCustomFields(fieldRows);
	const answerByFieldId = new Map(input.customAnswers.map((a) => [a.field_id, a.value]));
	const customAnswerRows: {
		booking_field_id: string;
		question_label: string;
		question_type: string;
		value_text: string | null;
		value_json: string[] | null;
	}[] = [];
	for (const f of publicCustomFields) {
		const raw = answerByFieldId.get(f.id);
		if (customTypeIsMulti(f.type)) {
			const values = Array.isArray(raw) ? raw.map((v) => v.trim()).filter(Boolean) : [];
			if (f.required && values.length === 0) cfgErrors[`custom_${f.id}`] = 'Required';
			if (values.length > 0)
				customAnswerRows.push({
					booking_field_id: f.id,
					question_label: f.label,
					question_type: f.type,
					value_text: null,
					value_json: values
				});
		} else {
			const text = typeof raw === 'string' ? raw.trim() : '';
			if (f.required && !text) cfgErrors[`custom_${f.id}`] = 'Required';
			if (text)
				customAnswerRows.push({
					booking_field_id: f.id,
					question_label: f.label,
					question_type: f.type,
					value_text: text,
					value_json: null
				});
		}
	}

	if (Object.keys(cfgErrors).length > 0) {
		return json(
			{ error: 'Please complete the required fields.', field_errors: cfgErrors },
			{ status: 422, headers: NO_STORE }
		);
	}

	// Effective values — hidden fields are dropped, never persisted.
	const effAddress =
		addressCfg.enabled && input.addressLine1 && input.city && input.state && input.zip
			? {
					line1: input.addressLine1,
					line2: input.addressLine2 ?? null,
					city: input.city,
					state: input.state,
					zip: input.zip
				}
			: null;
	const effEmail = emailCfg.enabled ? (input.email ?? null) : null;
	const effCompany = companyCfg.enabled ? (input.companyName ?? null) : null;
	const effLeadSource = leadCfg.enabled ? (input.leadSourceAnswer ?? null) : null;
	const effMarketingEmailOptIn = emailCfg.enabled ? input.marketingEmailOptIn : false;

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

	// 9. Re-run availability for the requested date; the chosen slot must still be in the set.
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
			{ error: 'This time is no longer available. Please select another time.' },
			{ status: 409, headers: NO_STORE }
		);
	}

	const slotEndDate = addMinutes(slotMatch, link.slot_duration_minutes);
	const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
	const approvalState = link.requires_approval ? ('pending' as const) : ('not_required' as const);

	// 10. Transaction — lock/re-check slot, contact upsert, address, request, assessment, outbox.
	let txResult:
		| { ok: true; requestId: string; scheduledStart: Date; orgName: string }
		| { ok: false; status: number; error: string };
	try {
		txResult = await db.transaction(async (tx) => {
			// 10a. Lock conflicting rows in the date window and re-run conflict detection.
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
				const bStart = a.scheduled_start!.getTime();
				const bEnd = (a.scheduled_end ? a.scheduled_end.getTime() : bStart + slotDurMs) + bufferMs;
				if (cStart < bEnd && cEnd > bStart) {
					return {
						ok: false as const,
						status: 409,
						error: 'This time is no longer available. Please select another time.'
					};
				}
			}

			// 10b. Contact upsert by (org_id, phone). Soft-deleted rows are skipped.
			//      Marketing consents are set only when CREATING the contact — we never
			//      silently flip an existing contact's opt-in/out state from a public form.
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
						full_name: fullName,
						company_name: effCompany,
						phone: e164,
						email: effEmail,
						status: 'lead',
						lead_source: 'website_form',
						email_opt_in: effMarketingEmailOptIn,
						sms_opted_in_at: input.marketingSmsOptIn ? new Date() : null
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

			// 10c. Property/service address. On a new contact it's the primary; on an
			//      existing contact we add it only if no matching (line1 + zip) address exists.
			let insertAddress = effAddress !== null;
			let isPrimary = contactCreated;
			if (!contactCreated && insertAddress) {
				const [addrMatch] = await tx
					.select({ id: contactAddresses.id })
					.from(contactAddresses)
					.where(
						and(
							eq(contactAddresses.contact_id, contactId),
							ilike(contactAddresses.address_line_1, effAddress!.line1.trim()),
							eq(contactAddresses.zip, effAddress!.zip.trim()),
							isNull(contactAddresses.deleted_at)
						)
					)
					.limit(1);
				if (addrMatch) insertAddress = false;
				if (insertAddress) {
					const [anyAddr] = await tx
						.select({ id: contactAddresses.id })
						.from(contactAddresses)
						.where(
							and(eq(contactAddresses.contact_id, contactId), isNull(contactAddresses.deleted_at))
						)
						.limit(1);
					isPrimary = !anyAddr;
				}
			}
			if (insertAddress) {
				await tx.insert(contactAddresses).values({
					org_id: link.org_id,
					contact_id: contactId,
					label: 'service',
					address_line_1: effAddress!.line1.trim(),
					address_line_2: effAddress!.line2,
					city: effAddress!.city.trim(),
					state: effAddress!.state.trim(),
					zip: effAddress!.zip.trim(),
					is_primary: isPrimary
				});
			}

			// 10d. Request (domain 19). Source public_form, approval per the form's gate.
			const [insertedRequest] = await tx
				.insert(requests)
				.values({
					org_id: link.org_id,
					contact_id: contactId,
					title: fullName,
					service_details: input.serviceDetails.trim(),
					lead_source_answer: input.leadSourceAnswer ?? null,
					source: 'public_form',
					booking_link_id: link.link_id,
					approval_state: approvalState
				})
				.returning({ id: requests.id, contact_id: requests.contact_id, source: requests.source });

			await tx.insert(outboxEvents).values({
				org_id: link.org_id,
				event_type: 'request.created',
				resource_type: 'request',
				resource_id: insertedRequest.id,
				payload: {
					request_id: insertedRequest.id,
					org_id: link.org_id,
					contact_id: insertedRequest.contact_id,
					source: insertedRequest.source,
					title: fullName,
					requires_approval: link.requires_approval
				},
				idempotency_key: `request.created:${insertedRequest.id}`
			});

			// 10d-ii. Custom-question answers (R5.2b). Snapshot label+type+value so an
			//         answer still reads correctly if the question is later edited/removed.
			if (customAnswerRows.length > 0) {
				await tx.insert(requestFieldAnswers).values(
					customAnswerRows.map((a, i) => ({
						org_id: link.org_id,
						request_id: insertedRequest.id,
						booking_field_id: a.booking_field_id,
						question_label: a.question_label,
						question_type: a.question_type,
						value_text: a.value_text,
						value_json: a.value_json,
						position: i
					}))
				);
			}

			// 10e. On-site assessment appointment at the chosen slot (type 'estimate',
			//      linked to the request). Placed on the calendar immediately even under
			//      the approval gate — the REQUEST's 'pending' status is what signals
			//      "not confirmed"; Accept keeps it, Decline cancels it.
			const [insertedAppt] = await tx
				.insert(appointments)
				.values({
					org_id: link.org_id,
					contact_id: contactId,
					job_id: null,
					request_id: insertedRequest.id,
					assigned_to: null,
					type: 'estimate',
					status: 'scheduled',
					title: link.title,
					scheduled_start: slotMatch,
					scheduled_end: slotEndDate,
					booking_source: 'booking_link',
					booked_via_link_id: link.link_id,
					customer_name: fullName,
					customer_phone: e164,
					customer_email: input.email ?? null,
					customer_notes: input.serviceDetails.trim(),
					booking_referrer: input.source ?? null,
					reminder_24h_sent: false,
					reminder_1h_sent: false
				})
				.returning({ id: appointments.id, scheduled_start: appointments.scheduled_start });

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
					request_id: insertedRequest.id,
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
				requestId: insertedRequest.id,
				scheduledStart: insertedAppt.scheduled_start!,
				orgName: orgSlug
			};
		});
	} catch (err) {
		console.error('[request submit] transaction failed:', err);
		return json(
			{ error: 'Could not submit your request. Please try again.' },
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
				requestId: txResult.requestId,
				scheduledStart: txResult.scheduledStart.toISOString(),
				requiresApproval: link.requires_approval
			}
		},
		{ status: 201, headers: NO_STORE }
	);
};
