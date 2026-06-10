import { json } from '@sveltejs/kit';
import { eq, asc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, emailDomains, emailSenderAddresses } from '$lib/server/db/schema';
import { assertOrgActive } from '$lib/server/auth/assertOrgActive';
import { defaultLocalPart } from '$lib/server/email/senderAddresses';

/**
 * Lightweight From-address picker source for the inbox composer. Unlike
 * /api/settings/email (admin-only, full identity editor) this is readable by
 * anyone who can send messages, so a non-admin agent can still choose which
 * branded address an outbound email goes from.
 *
 * Returns nothing useful until the sending domain is verified — extras live on
 * the verified domain, and an unverified domain can't send at all (the email
 * worker marks such sends undeliverable). When `sending_domain` is null the
 * composer simply omits the picker.
 */
type FromOption = { local_part: string; label: string | null; address: string };

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	assertOrgActive(auth);
	if (!auth.member.can_send_messages) {
		return json({ error: 'You do not have permission to send messages.' }, { status: 403 });
	}

	const [org] = await db
		.select({ slug: organizations.slug, email_sender_local: organizations.email_sender_local })
		.from(organizations)
		.where(eq(organizations.id, auth.orgId))
		.limit(1);
	if (!org) return json({ error: 'Organization not found.' }, { status: 404 });

	const [domainRow] = await db
		.select({ domain: emailDomains.domain, status: emailDomains.status })
		.from(emailDomains)
		.where(eq(emailDomains.org_id, auth.orgId))
		.limit(1);

	if (!domainRow || domainRow.status !== 'verified') {
		return json({ data: { sending_domain: null, default: null, extras: [] } });
	}

	const sendingDomain = domainRow.domain;
	const defaultLocal = defaultLocalPart(org);

	const extraRows = await db
		.select({
			local_part: emailSenderAddresses.local_part,
			label: emailSenderAddresses.label
		})
		.from(emailSenderAddresses)
		.where(eq(emailSenderAddresses.org_id, auth.orgId))
		.orderBy(asc(emailSenderAddresses.created_at));

	const defaultOption: FromOption = {
		local_part: defaultLocal,
		label: 'Default',
		address: `${defaultLocal}@${sendingDomain}`
	};
	const extras: FromOption[] = extraRows.map((r) => ({
		local_part: r.local_part,
		label: r.label,
		address: `${r.local_part}@${sendingDomain}`
	}));

	return json({ data: { sending_domain: sendingDomain, default: defaultOption, extras } });
};
