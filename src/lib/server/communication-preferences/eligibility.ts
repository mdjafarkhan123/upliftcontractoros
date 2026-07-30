import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { parallel } from '$lib/server/db/parallel';
import {
	contactCommunicationConsents,
	contactCommunicationPreferences,
	contacts,
	emailDomains,
	messengerContacts,
	organizations,
	webchatSessions,
	type CommunicationConsentStatus,
	type CommunicationPreferenceCategory,
	type CommunicationPreferenceChannel,
	type CommunicationPreferenceDirection,
	type CommunicationPreferenceStatus
} from '$lib/server/db/schema';
import { isWithinQuietHours, msUntilQuietHoursEnd } from '$lib/server/sms/quietHours';
import { isReleasedPhone } from '$lib/utils/phone';

type ReachabilityChannel = Exclude<CommunicationPreferenceChannel, 'all'>;
type ContactRow = {
	id: string;
	phone: string | null;
	email: string | null;
	status: 'lead' | 'customer' | 'archived';
	deleted_at: Date | null;
};

type OrgRow = {
	id: string;
	sms_enabled: boolean;
	twilio_phone_number: string | null;
	sms_approval_status: 'not_required' | 'pending' | 'approved' | 'rejected';
	timezone: string;
	quiet_hours_enabled: boolean;
	quiet_hours_start_hour: number;
	quiet_hours_end_hour: number;
	feature_messenger: boolean;
	feature_webchat: boolean;
};

export type CommunicationEligibilityInput = {
	orgId: string;
	contactId: string;
	channel: ReachabilityChannel;
	direction: Exclude<CommunicationPreferenceDirection, 'all'>;
	category: Exclude<CommunicationPreferenceCategory, 'all'>;
	now?: Date;
	conversationId?: string | null;
};

export type CommunicationEligibilityPreferenceMatch = {
	id: string;
	channel: CommunicationPreferenceChannel;
	direction: CommunicationPreferenceDirection;
	category: CommunicationPreferenceCategory;
	status: CommunicationPreferenceStatus;
	source: string;
	reasonCode: string | null;
	reasonMessage: string | null;
};

export type CommunicationEligibilityConsentMatch = {
	id: string;
	channel: CommunicationPreferenceChannel;
	category: CommunicationPreferenceCategory;
	status: CommunicationConsentStatus;
	source: string;
};

export type CommunicationReachability = {
	hasPhone: boolean;
	hasEmail: boolean;
	phoneReleased: boolean;
	orgSmsReady: boolean;
	orgEmailReady: boolean;
	messengerReady: boolean;
	webchatReady: boolean;
};

export type CommunicationEligibilityResult = {
	allowed: boolean;
	blockedBy: 'preference' | 'consent' | 'reachability' | 'timing' | null;
	reasonCode: string | null;
	reasonMessage: string | null;
	matchedPreference?: CommunicationEligibilityPreferenceMatch;
	matchedConsent?: CommunicationEligibilityConsentMatch;
	reachability: CommunicationReachability;
	retryAt: Date | null;
};

type PreferenceRow = CommunicationEligibilityPreferenceMatch & {
	effectiveFrom: Date;
	expiresAt: Date | null;
};

type ConsentRow = CommunicationEligibilityConsentMatch;

type ResolverInput = CommunicationEligibilityInput & {
	now: Date;
	contact: ContactRow | null;
	org: OrgRow | null;
	emailReady: boolean;
	messengerReady: boolean;
	webchatReady: boolean;
	preferences: PreferenceRow[];
	consents: ConsentRow[];
};

const OPT_IN_REQUIRED_CATEGORIES = new Set<CommunicationPreferenceCategory>(['marketing']);

function blocked(
	blockedBy: CommunicationEligibilityResult['blockedBy'],
	reasonCode: string,
	reasonMessage: string,
	reachability: CommunicationReachability,
	extra: Partial<CommunicationEligibilityResult> = {}
): CommunicationEligibilityResult {
	return {
		allowed: false,
		blockedBy,
		reasonCode,
		reasonMessage,
		reachability,
		retryAt: null,
		...extra
	};
}

function allowed(reachability: CommunicationReachability): CommunicationEligibilityResult {
	return {
		allowed: true,
		blockedBy: null,
		reasonCode: null,
		reasonMessage: null,
		reachability,
		retryAt: null
	};
}

function scopeSpecificity(row: {
	channel: CommunicationPreferenceChannel;
	direction?: CommunicationPreferenceDirection;
	category: CommunicationPreferenceCategory;
}): number {
	return (
		(row.channel === 'all' ? 0 : 1) +
		(row.direction === 'all' ? 0 : 1) +
		(row.category === 'all' ? 0 : 1)
	);
}

function newestFirst(a: { effectiveFrom?: Date }, b: { effectiveFrom?: Date }): number {
	return (b.effectiveFrom?.getTime() ?? 0) - (a.effectiveFrom?.getTime() ?? 0);
}

function pickMostSpecificPreference(rows: PreferenceRow[]): PreferenceRow | undefined {
	return [...rows].sort(
		(a, b) => scopeSpecificity(b) - scopeSpecificity(a) || newestFirst(a, b)
	)[0];
}

function pickMostSpecificConsent(rows: ConsentRow[]): ConsentRow | undefined {
	return [...rows].sort((a, b) => scopeSpecificity(b) - scopeSpecificity(a))[0];
}

function isActivePreference(row: PreferenceRow, now: Date): boolean {
	return row.effectiveFrom <= now && (!row.expiresAt || row.expiresAt > now);
}

function isGlobalBlock(row: PreferenceRow): boolean {
	return row.channel === 'all' && row.direction === 'all' && row.category === 'all';
}

function preferenceReason(
	row: PreferenceRow,
	fallbackCode: string
): { code: string; message: string } {
	const scope =
		row.channel === 'all' && row.direction === 'all' && row.category === 'all'
			? 'all communication'
			: `${row.channel}/${row.direction}/${row.category}`;
	return {
		code: row.reasonCode ?? fallbackCode,
		message: row.reasonMessage ?? `Contact DND is ${row.status} for ${scope}.`
	};
}

function consentBlocks(consent: ConsentRow | undefined): boolean {
	return consent?.status === 'revoked' || consent?.status === 'opted_out';
}

function consentAllows(consent: ConsentRow | undefined): boolean {
	return consent?.status === 'opted_in';
}

function buildReachability(input: ResolverInput): CommunicationReachability {
	const contact = input.contact;
	const org = input.org;
	const phone = contact?.phone ?? null;

	return {
		hasPhone: Boolean(phone),
		hasEmail: Boolean(contact?.email),
		phoneReleased: isReleasedPhone(phone),
		orgSmsReady: Boolean(
			org?.sms_enabled &&
			org.twilio_phone_number &&
			(org.sms_approval_status === 'approved' || org.sms_approval_status === 'not_required')
		),
		orgEmailReady: input.emailReady,
		messengerReady: input.messengerReady,
		webchatReady: input.webchatReady
	};
}

function evaluatePreferenceBlocks(input: ResolverInput, reachability: CommunicationReachability) {
	const activeBlocks = input.preferences.filter(
		(row) => row.status !== 'allowed' && isActivePreference(row, input.now)
	);
	const globalBlock = pickMostSpecificPreference(activeBlocks.filter(isGlobalBlock));
	if (globalBlock) {
		const reason = preferenceReason(globalBlock, 'CONTACT_DND_GLOBAL');
		return blocked('preference', reason.code, reason.message, reachability, {
			matchedPreference: globalBlock
		});
	}

	const permanentBlock = pickMostSpecificPreference(
		activeBlocks.filter((row) => row.status === 'permanent')
	);
	if (permanentBlock) {
		const reason = preferenceReason(permanentBlock, 'CONTACT_DND_PERMANENT');
		return blocked('preference', reason.code, reason.message, reachability, {
			matchedPreference: permanentBlock
		});
	}

	const scopedBlock = pickMostSpecificPreference(
		activeBlocks.filter((row) => row.status === 'blocked')
	);
	if (scopedBlock) {
		const reason = preferenceReason(scopedBlock, 'CONTACT_DND_BLOCKED');
		return blocked('preference', reason.code, reason.message, reachability, {
			matchedPreference: scopedBlock
		});
	}

	return null;
}

function evaluateConsent(input: ResolverInput, reachability: CommunicationReachability) {
	if (input.direction !== 'outbound') return null;

	const blockingConsent = pickMostSpecificConsent(input.consents.filter(consentBlocks));
	if (blockingConsent) {
		return blocked(
			'consent',
			blockingConsent.status === 'revoked' ? 'CONSENT_REVOKED' : 'CONSENT_OPTED_OUT',
			`Contact consent is ${blockingConsent.status} for ${blockingConsent.channel}/${blockingConsent.category}.`,
			reachability,
			{ matchedConsent: blockingConsent }
		);
	}

	if (!OPT_IN_REQUIRED_CATEGORIES.has(input.category)) return null;

	const affirmativeConsent = pickMostSpecificConsent(input.consents.filter(consentAllows));
	if (!affirmativeConsent) {
		return blocked(
			'consent',
			'CONSENT_OPT_IN_REQUIRED',
			`Contact has not opted in for ${input.channel}/${input.category}.`,
			reachability
		);
	}

	return null;
}

function evaluateSmsTiming(input: ResolverInput, reachability: CommunicationReachability) {
	const org = input.org;
	if (input.channel !== 'sms' || input.direction !== 'outbound' || !org?.quiet_hours_enabled)
		return null;

	if (
		!isWithinQuietHours(
			input.now,
			org.timezone,
			org.quiet_hours_start_hour,
			org.quiet_hours_end_hour
		)
	) {
		return null;
	}

	const delay = msUntilQuietHoursEnd(input.now, org.timezone, org.quiet_hours_end_hour);
	return blocked(
		'timing',
		'SMS_QUIET_HOURS',
		'Outbound SMS is inside the organization quiet-hours window.',
		reachability,
		{ retryAt: new Date(input.now.getTime() + delay) }
	);
}

function evaluateReachability(input: ResolverInput, reachability: CommunicationReachability) {
	if (input.direction !== 'outbound') return null;

	const contact = input.contact;
	if (!contact) {
		return blocked('reachability', 'CONTACT_NOT_FOUND', 'Contact was not found.', reachability);
	}
	if (contact.deleted_at) {
		return blocked('reachability', 'CONTACT_DELETED', 'Contact has been deleted.', reachability);
	}
	if (contact.status === 'archived') {
		return blocked('reachability', 'CONTACT_ARCHIVED', 'Contact is archived.', reachability);
	}
	if (!input.org) {
		return blocked('reachability', 'ORG_NOT_FOUND', 'Organization was not found.', reachability);
	}

	switch (input.channel) {
		case 'sms':
			if (!reachability.hasPhone) {
				return blocked(
					'reachability',
					'CONTACT_NO_PHONE',
					'Contact has no phone number.',
					reachability
				);
			}
			if (reachability.phoneReleased) {
				return blocked(
					'reachability',
					'CONTACT_PHONE_RELEASED',
					'Contact phone number has been released.',
					reachability
				);
			}
			if (!input.org.sms_enabled) {
				return blocked(
					'reachability',
					'ORG_SMS_DISABLED',
					'SMS is disabled for this organization.',
					reachability
				);
			}
			if (!input.org.twilio_phone_number) {
				return blocked(
					'reachability',
					'ORG_SMS_UNCONFIGURED',
					'Organization is not configured for SMS.',
					reachability
				);
			}
			if (input.org.sms_approval_status === 'pending') {
				return blocked(
					'reachability',
					'ORG_SMS_CARRIER_PENDING',
					'Outbound SMS is pending carrier approval.',
					reachability
				);
			}
			if (input.org.sms_approval_status === 'rejected') {
				return blocked(
					'reachability',
					'ORG_SMS_CARRIER_REJECTED',
					'Carrier registration was rejected, so outbound SMS is blocked.',
					reachability
				);
			}
			return null;
		case 'email':
			if (!reachability.hasEmail) {
				return blocked(
					'reachability',
					'CONTACT_NO_EMAIL',
					'Contact has no email address.',
					reachability
				);
			}
			if (!reachability.orgEmailReady) {
				return blocked(
					'reachability',
					'ORG_EMAIL_NOT_READY',
					'Email domain is not verified for this organization.',
					reachability
				);
			}
			return null;
		case 'call':
			if (!reachability.hasPhone) {
				return blocked(
					'reachability',
					'CONTACT_NO_PHONE',
					'Contact has no phone number.',
					reachability
				);
			}
			if (reachability.phoneReleased) {
				return blocked(
					'reachability',
					'CONTACT_PHONE_RELEASED',
					'Contact phone number has been released.',
					reachability
				);
			}
			return null;
		case 'messenger':
			if (!input.org.feature_messenger || !reachability.messengerReady) {
				return blocked(
					'reachability',
					'MESSENGER_NOT_READY',
					'Contact is not reachable through Messenger.',
					reachability
				);
			}
			return null;
		case 'webchat':
			if (!input.conversationId) {
				return blocked(
					'reachability',
					'WEBCHAT_CONVERSATION_REQUIRED',
					'Webchat reachability requires a conversation.',
					reachability
				);
			}
			if (!input.org.feature_webchat || !reachability.webchatReady) {
				return blocked(
					'reachability',
					'WEBCHAT_NOT_READY',
					'Contact is not reachable through an active webchat session.',
					reachability
				);
			}
			return null;
		case 'whatsapp':
			if (!reachability.hasPhone) {
				return blocked(
					'reachability',
					'CONTACT_NO_PHONE',
					'Contact has no phone number.',
					reachability
				);
			}
			if (reachability.phoneReleased) {
				return blocked(
					'reachability',
					'CONTACT_PHONE_RELEASED',
					'Contact phone number has been released.',
					reachability
				);
			}
			return blocked(
				'reachability',
				'WHATSAPP_NOT_CONFIGURED',
				'WhatsApp sending is not configured for this organization.',
				reachability
			);
		case 'gbp':
			return blocked(
				'reachability',
				'GBP_NOT_CONFIGURED',
				'Google Business Profile messaging is not configured for this organization.',
				reachability
			);
	}
}

export function resolveCommunicationEligibility(
	input: ResolverInput
): CommunicationEligibilityResult {
	const reachability = buildReachability(input);

	const preferenceBlock = evaluatePreferenceBlocks(input, reachability);
	if (preferenceBlock) return preferenceBlock;

	const consentBlock = evaluateConsent(input, reachability);
	if (consentBlock) return consentBlock;

	const timingBlock = evaluateSmsTiming(input, reachability);
	if (timingBlock) return timingBlock;

	const reachabilityBlock = evaluateReachability(input, reachability);
	if (reachabilityBlock) return reachabilityBlock;

	return allowed(reachability);
}

/**
 * Authoritative server-side customer communication gate.
 *
 * GHL mapping:
 * - `blocked` = active DND
 * - `allowed` = inactive DND
 * - `permanent` = hard opt-out/provider block
 */
export async function canContactReceiveCommunication(
	input: CommunicationEligibilityInput
): Promise<CommunicationEligibilityResult> {
	const now = input.now ?? new Date();
	const channels: CommunicationPreferenceChannel[] = ['all', input.channel];
	const directions: CommunicationPreferenceDirection[] = ['all', input.direction];
	const categories: CommunicationPreferenceCategory[] = ['all', input.category];

	const {
		contactRows,
		orgRows,
		preferenceRows,
		consentRows,
		emailRows,
		messengerRows,
		webchatRows
	} = await parallel({
		contactRows: db
			.select({
				id: contacts.id,
				phone: contacts.phone,
				email: contacts.email,
				status: contacts.status,
				deleted_at: contacts.deleted_at
			})
			.from(contacts)
			.where(and(eq(contacts.org_id, input.orgId), eq(contacts.id, input.contactId)))
			.limit(1),
		orgRows: db
			.select({
				id: organizations.id,
				sms_enabled: organizations.sms_enabled,
				twilio_phone_number: organizations.twilio_phone_number,
				sms_approval_status: organizations.sms_approval_status,
				timezone: organizations.timezone,
				quiet_hours_enabled: organizations.quiet_hours_enabled,
				quiet_hours_start_hour: organizations.quiet_hours_start_hour,
				quiet_hours_end_hour: organizations.quiet_hours_end_hour,
				feature_messenger: organizations.feature_messenger,
				feature_webchat: organizations.feature_webchat
			})
			.from(organizations)
			.where(eq(organizations.id, input.orgId))
			.limit(1),
		preferenceRows: db
			.select({
				id: contactCommunicationPreferences.id,
				channel: contactCommunicationPreferences.channel,
				direction: contactCommunicationPreferences.direction,
				category: contactCommunicationPreferences.category,
				status: contactCommunicationPreferences.status,
				source: contactCommunicationPreferences.source,
				reasonCode: contactCommunicationPreferences.reason_code,
				reasonMessage: contactCommunicationPreferences.reason_message,
				effectiveFrom: contactCommunicationPreferences.effective_from,
				expiresAt: contactCommunicationPreferences.expires_at
			})
			.from(contactCommunicationPreferences)
			.where(
				and(
					eq(contactCommunicationPreferences.org_id, input.orgId),
					eq(contactCommunicationPreferences.contact_id, input.contactId),
					inArray(contactCommunicationPreferences.channel, channels),
					inArray(contactCommunicationPreferences.direction, directions),
					inArray(contactCommunicationPreferences.category, categories),
					lte(contactCommunicationPreferences.effective_from, now),
					or(
						isNull(contactCommunicationPreferences.expires_at),
						gt(contactCommunicationPreferences.expires_at, now)
					)
				)
			),
		consentRows: db
			.select({
				id: contactCommunicationConsents.id,
				channel: contactCommunicationConsents.channel,
				category: contactCommunicationConsents.category,
				status: contactCommunicationConsents.status,
				source: contactCommunicationConsents.source
			})
			.from(contactCommunicationConsents)
			.where(
				and(
					eq(contactCommunicationConsents.org_id, input.orgId),
					eq(contactCommunicationConsents.contact_id, input.contactId),
					inArray(contactCommunicationConsents.channel, channels),
					inArray(contactCommunicationConsents.category, categories)
				)
			),
		emailRows:
			input.channel === 'email'
				? db
						.select({ id: emailDomains.id })
						.from(emailDomains)
						.where(and(eq(emailDomains.org_id, input.orgId), eq(emailDomains.status, 'verified')))
						.limit(1)
				: Promise.resolve([]),
		messengerRows:
			input.channel === 'messenger'
				? db
						.select({ id: messengerContacts.id })
						.from(messengerContacts)
						.where(
							and(
								eq(messengerContacts.org_id, input.orgId),
								eq(messengerContacts.contact_id, input.contactId)
							)
						)
						.limit(1)
				: Promise.resolve([]),
		webchatRows:
			input.channel === 'webchat' && input.conversationId
				? db
						.select({ id: webchatSessions.id })
						.from(webchatSessions)
						.where(
							and(
								eq(webchatSessions.org_id, input.orgId),
								eq(webchatSessions.contact_id, input.contactId),
								eq(webchatSessions.conversation_id, input.conversationId)
							)
						)
						.limit(1)
				: Promise.resolve([])
	});

	return resolveCommunicationEligibility({
		...input,
		now,
		contact: contactRows[0] ?? null,
		org: orgRows[0] ?? null,
		preferences: preferenceRows,
		consents: consentRows,
		emailReady: emailRows.length > 0,
		messengerReady: messengerRows.length > 0,
		webchatReady: webchatRows.length > 0
	});
}
