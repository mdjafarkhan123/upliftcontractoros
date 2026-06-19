/**
 * POST /api/webchat/session/start
 * Public — no auth.
 *
 * Rate limit: 10 req / hour / IP hash
 * Security: Origin/Referer must match domain_allowlist
 */
import { json } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	contacts,
	conversations,
	messages,
	organizations,
	outboxEvents,
	webchatSessions,
	webchatWidgets
} from '$lib/server/db/schema';
import { validateOrigin } from '$lib/server/webchat/validateOrigin';
import { checkStartRateLimit } from '$lib/server/webchat/rateLimit';
import { sanitizeMessageBody } from '$lib/server/webchat/sanitize';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';
import { sha256 } from '$lib/utils/hash';
import { toE164, PhoneInvalidError } from '$lib/utils/phone';

const startSchema = z
	.object({
		widget_token: z.string().uuid('Invalid widget token'),
		name: z.string().min(1, 'Name is required').max(200),
		// Phone OR email — at least one is required (enforced by the refine below).
		// Matches GHL's pre-chat contact form: name mandatory, one contact method.
		phone: z
			.string()
			.max(40)
			.optional()
			.transform((v) => {
				const t = v?.trim();
				return t && t.length > 0 ? t : undefined;
			}),
		email: z
			.string()
			.max(200)
			.optional()
			.transform((v) => {
				const t = v?.trim().toLowerCase();
				return t && t.length > 0 ? t : undefined;
			}),
		// Express consent (TCPA): the visitor must tick the consent box before we may
		// send automated texts/emails. Required — must be exactly true.
		consent: z.boolean().refine((v) => v === true, {
			message: 'Please agree to be contacted so we can reply.'
		})
	})
	.refine((d) => Boolean(d.phone || d.email), {
		message: 'Enter a phone number or email so we can reply.',
		path: ['phone']
	});

function getIpHash(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
	return sha256(ip);
}

export const POST: RequestHandler = async ({ request }) => {
	// Parse body
	let parsed: z.infer<typeof startSchema>;
	try {
		const body = await request.json();
		const result = startSchema.safeParse(body);
		if (!result.success) {
			const issue = result.error.issues[0];
			return json({ error: issue?.message ?? 'Invalid input' }, { status: 400 });
		}
		parsed = result.data;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// Rate limit by IP hash
	const ipHash = getIpHash(request);
	const rateCheck = checkStartRateLimit(ipHash);
	if (!rateCheck.ok) {
		return json(
			{ error: 'Too many requests. Please try again later.' },
			{
				status: 429,
				headers: { 'Retry-After': String(rateCheck.retryAfter) }
			}
		);
	}

	// Find org by widget_token
	const [org] = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			logo_url: organizations.logo_url,
			primary_color: organizations.primary_color,
			status: organizations.status,
			feature_webchat: organizations.feature_webchat
		})
		.from(organizations)
		.where(
			and(eq(organizations.widget_token, parsed.widget_token), isNull(organizations.deleted_at))
		)
		.limit(1);

	if (!org || org.status !== 'active' || !org.feature_webchat) {
		return json({ error: 'Widget not available' }, { status: 404 });
	}

	const [widget] = await db
		.select()
		.from(webchatWidgets)
		.where(and(eq(webchatWidgets.org_id, org.id), eq(webchatWidgets.is_active, true)))
		.limit(1);

	if (!widget) {
		return json({ error: 'Widget not configured' }, { status: 404 });
	}

	// Validate origin
	if (!validateOrigin(request, widget.domain_allowlist)) {
		return json({ error: 'Origin not permitted' }, { status: 403 });
	}

	// Validate email format when provided.
	if (parsed.email && !z.string().email().safeParse(parsed.email).success) {
		return json(
			{
				error: 'Enter a valid email address.',
				field_errors: { email: 'Enter a valid email address.' }
			},
			{ status: 400 }
		);
	}

	// Normalize phone to E.164 when provided. Phone is optional now (email-only
	// visitors are allowed), but a present value must still be valid.
	let phone: string | undefined;
	if (parsed.phone) {
		try {
			phone = toE164(parsed.phone);
		} catch (e) {
			if (e instanceof PhoneInvalidError) {
				return json(
					{
						error: e.message,
						field_errors: { phone: e.message }
					},
					{ status: 400 }
				);
			}
			return json({ error: 'Invalid phone number' }, { status: 400 });
		}
	}
	const email = parsed.email;

	const name = sanitizeMessageBody(parsed.name);
	const userAgentHash = sha256(request.headers.get('user-agent') ?? 'unknown');

	// Run in transaction
	const result = await db.transaction(async (tx) => {
		// Find or create contact. Dedup by phone (the UNIQUE(org_id, phone) key)
		// when a phone was given; otherwise best-effort match by email (no DB
		// uniqueness on email — case-insensitive lookup, same as the import flow).
		const [existing] = phone
			? await tx
					.select()
					.from(contacts)
					.where(
						and(eq(contacts.org_id, org.id), eq(contacts.phone, phone), isNull(contacts.deleted_at))
					)
					.limit(1)
			: await tx
					.select()
					.from(contacts)
					.where(
						and(
							eq(contacts.org_id, org.id),
							sql`lower(${contacts.email}) = ${email}`,
							isNull(contacts.deleted_at)
						)
					)
					.limit(1);

		let contact: typeof existing;
		let isNewContact = false;

		if (existing) {
			contact = existing;
			// Enrich a matched contact with a missing email (never phone — phone is
			// the unique dedup key and backfilling it could collide with another row).
			if (email && !existing.email) {
				await tx
					.update(contacts)
					.set({ email, email_opt_in: true, updated_at: new Date() })
					.where(eq(contacts.id, existing.id));
				contact = { ...existing, email, email_opt_in: true };
			}
			// Emit duplicate detected event
			await tx.insert(outboxEvents).values({
				org_id: org.id,
				event_type: 'contact.duplicate_detected',
				resource_type: 'contact',
				resource_id: existing.id,
				payload: { contact_id: existing.id, org_id: org.id, source: 'webchat' },
				idempotency_key: `contact.duplicate_detected:webchat:${existing.id}:${Date.now()}`
			});
		} else {
			isNewContact = true;
			const [created] = await tx
				.insert(contacts)
				.values({
					org_id: org.id,
					full_name: name,
					phone: phone ?? null,
					email: email ?? null,
					// The visitor ticked the required express-consent box, so opt them into
					// the channel(s) they gave us. email_opt_in lets the email side of
					// Speed-to-Lead (and other sequences) send; sms_opted_in_at records the
					// TCPA consent timestamp for any phone we'll auto-text.
					email_opt_in: Boolean(email),
					sms_opted_in_at: phone ? new Date() : null,
					status: 'lead',
					lead_source: 'live_chat'
				})
				.returning();
			contact = created;

			await tx.insert(outboxEvents).values({
				org_id: org.id,
				event_type: 'contact.created',
				resource_type: 'contact',
				resource_id: contact.id,
				payload: {
					contact_id: contact.id,
					org_id: org.id,
					full_name: name,
					phone: phone ?? null,
					email: email ?? null,
					lead_source: 'live_chat'
				},
				idempotency_key: `contact.created:${contact.id}`
			});
			// Live web chat is a genuine inbound capture, so it ALSO emits
			// lead.created — the event that drives Speed-to-Lead. (contact.created
			// alone is feed-only and no longer auto-texts.) Mirrors how the inbound
			// SMS/call/Messenger channels co-emit both events.
			await tx.insert(outboxEvents).values({
				org_id: org.id,
				event_type: 'lead.created',
				resource_type: 'contact',
				resource_id: contact.id,
				payload: {
					contact_id: contact.id,
					org_id: org.id,
					lead_source: 'live_chat',
					origin: 'webchat'
				},
				idempotency_key: `lead.created:${contact.id}`
			});
		}

		// Find open conversation or create one. Channel-agnostic — the inbox is
		// unified across channels.
		const [existingConv] = await tx
			.select()
			.from(conversations)
			.where(
				and(
					eq(conversations.org_id, org.id),
					eq(conversations.contact_id, contact.id),
					eq(conversations.status, 'open'),
					isNull(conversations.deleted_at)
				)
			)
			.limit(1);

		let conversation: typeof existingConv;
		const isNewConv = !existingConv;

		if (existingConv) {
			conversation = existingConv;
		} else {
			const [created] = await tx
				.insert(conversations)
				.values({
					org_id: org.id,
					contact_id: contact.id,
					status: 'open'
				})
				.returning();
			conversation = created;

			await tx.insert(outboxEvents).values({
				org_id: org.id,
				event_type: 'conversation.created',
				resource_type: 'conversation',
				resource_id: conversation.id,
				payload: {
					conversation_id: conversation.id,
					contact_id: contact.id,
					org_id: org.id,
					channel: 'webchat'
				},
				idempotency_key: `conversation.created:${conversation.id}`
			});
		}

		// Create webchat session
		const [wcSession] = await tx
			.insert(webchatSessions)
			.values({
				org_id: org.id,
				contact_id: contact.id,
				conversation_id: conversation.id,
				visitor_ip_hash: ipHash,
				user_agent_hash: userAgentHash
			})
			.returning();

		return { wcSession, conversation, isNewContact, isNewConv };
	});

	return json(
		{
			data: {
				session_id: result.wcSession.id,
				session_token: result.wcSession.session_token,
				org_name: org.name,
				primary_color: org.primary_color ?? '#6366f1',
				logo_url: await resolveLogoUrl(org.logo_url),
				intro_message:
					widget.intro_message ??
					"We'll text you back — no robocalls, just a real person from our team.",
				offline_message:
					widget.offline_message ??
					"We're currently on site helping customers. Leave your details and we'll reply as soon as possible.",
				webchat_mode: widget.webchat_mode as 'instant' | 'asynchronous'
			}
		},
		{ status: 201 }
	);
};
