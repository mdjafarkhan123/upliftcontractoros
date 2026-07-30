import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contactCommunicationConsents,
	contactCommunicationPreferenceEvents,
	contactCommunicationPreferences,
	contacts,
	outboxEvents
} from '$lib/server/db/schema';
import type {
	CommunicationConsentStatus,
	CommunicationPreferenceCategory,
	CommunicationPreferenceChannel,
	CommunicationPreferenceDirection,
	CommunicationPreferenceSource,
	CommunicationPreferenceStatus
} from '$lib/server/db/schema';

export type PreferenceScope = {
	channel: CommunicationPreferenceChannel;
	direction: CommunicationPreferenceDirection;
	category: CommunicationPreferenceCategory;
};

export type ChangePreferenceInput = PreferenceScope & {
	orgId: string;
	contactId: string;
	status: CommunicationPreferenceStatus;
	source: CommunicationPreferenceSource;
	actorMemberId?: string | null;
	reasonCode?: string | null;
	reasonMessage?: string | null;
	metadata?: Record<string, unknown>;
	provider?: string | null;
	providerEventId?: string | null;
	allowPermanentClear?: boolean;
};

export type ChangeConsentInput = {
	orgId: string;
	contactId: string;
	channel: CommunicationPreferenceChannel;
	category: CommunicationPreferenceCategory;
	status: CommunicationConsentStatus;
	source: CommunicationPreferenceSource;
	evidence?: Record<string, unknown>;
};

export class CommunicationPreferenceMutationError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, message: string, status = 422) {
		super(message);
		this.name = 'CommunicationPreferenceMutationError';
		this.code = code;
		this.status = status;
	}
}

/** HighLevel inbound DND is one global switch for inbound calls and SMS. */
export function assertSupportedPreferenceScope(input: PreferenceScope) {
	if (input.direction === 'inbound' && (input.channel !== 'all' || input.category !== 'all')) {
		throw new CommunicationPreferenceMutationError(
			'INVALID_INBOUND_DND_SCOPE',
			'Inbound DND must apply to all inbound communication.',
			422
		);
	}
}

type PreferenceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function preferencePayload(
	input: ChangePreferenceInput,
	eventId: string,
	previousStatus: string | null
) {
	return {
		event_version: 1,
		event_id: eventId,
		org_id: input.orgId,
		contact_id: input.contactId,
		channel: input.channel,
		direction: input.direction,
		category: input.category,
		previous_status: previousStatus,
		next_status: input.status,
		source: input.source,
		reason_code: input.reasonCode ?? null,
		reason_message: input.reasonMessage ?? null,
		actor_member_id: input.actorMemberId ?? null,
		provider: input.provider ?? null,
		provider_event_id: input.providerEventId ?? null,
		metadata: input.metadata ?? {}
	};
}

export async function changeCommunicationPreference(input: ChangePreferenceInput) {
	return db.transaction((tx) => changeCommunicationPreferenceInTransaction(tx, input));
}

/**
 * Use when the preference change is part of another business transaction,
 * such as a provider callback. The audit row and preference-changed outbox
 * event must commit with that callback's state change.
 */
export async function changeCommunicationPreferenceInTransaction(
	tx: PreferenceTx,
	input: ChangePreferenceInput
) {
	assertSupportedPreferenceScope(input);
	const now = new Date();
	const [contact] = await tx
		.select({ id: contacts.id })
		.from(contacts)
		.where(and(eq(contacts.org_id, input.orgId), eq(contacts.id, input.contactId)))
		.limit(1);
	if (!contact) {
		throw new CommunicationPreferenceMutationError('CONTACT_NOT_FOUND', 'Contact not found.', 404);
	}

	const [current] = await tx
		.select()
		.from(contactCommunicationPreferences)
		.where(
			and(
				eq(contactCommunicationPreferences.org_id, input.orgId),
				eq(contactCommunicationPreferences.contact_id, input.contactId),
				eq(contactCommunicationPreferences.channel, input.channel),
				eq(contactCommunicationPreferences.direction, input.direction),
				eq(contactCommunicationPreferences.category, input.category)
			)
		)
		.limit(1);

	if (current?.status === input.status) {
		return { changed: false, preference: current, event: null };
	}

	if (
		current?.status === 'permanent' &&
		input.status !== 'permanent' &&
		!input.allowPermanentClear
	) {
		throw new CommunicationPreferenceMutationError(
			'PERMANENT_DND_LOCKED',
			'Permanent provider or customer opt-out cannot be cleared from this API.'
		);
	}

	const [preference] = await tx
		.insert(contactCommunicationPreferences)
		.values({
			org_id: input.orgId,
			contact_id: input.contactId,
			channel: input.channel,
			direction: input.direction,
			category: input.category,
			status: input.status,
			source: input.source,
			reason_code: input.reasonCode ?? null,
			reason_message: input.reasonMessage ?? null,
			actor_member_id: input.actorMemberId ?? null,
			provider: input.provider ?? null,
			provider_event_id: input.providerEventId ?? null,
			metadata: input.metadata ?? {},
			effective_from: now,
			updated_at: now
		})
		.onConflictDoUpdate({
			target: [
				contactCommunicationPreferences.org_id,
				contactCommunicationPreferences.contact_id,
				contactCommunicationPreferences.channel,
				contactCommunicationPreferences.direction,
				contactCommunicationPreferences.category
			],
			set: {
				status: input.status,
				source: input.source,
				reason_code: input.reasonCode ?? null,
				reason_message: input.reasonMessage ?? null,
				actor_member_id: input.actorMemberId ?? null,
				provider: input.provider ?? null,
				provider_event_id: input.providerEventId ?? null,
				metadata: input.metadata ?? {},
				effective_from: now,
				updated_at: now
			}
		})
		.returning();

	const eventId = crypto.randomUUID();
	const payload = preferencePayload(input, eventId, current?.status ?? null);
	const [auditEvent] = await tx
		.insert(contactCommunicationPreferenceEvents)
		.values({
			id: eventId,
			org_id: input.orgId,
			contact_id: input.contactId,
			preference_id: preference.id,
			channel: input.channel,
			direction: input.direction,
			category: input.category,
			previous_status: current?.status ?? null,
			next_status: input.status,
			source: input.source,
			reason_code: input.reasonCode ?? null,
			reason_message: input.reasonMessage ?? null,
			actor_member_id: input.actorMemberId ?? null,
			provider: input.provider ?? null,
			provider_event_id: input.providerEventId ?? null,
			metadata: input.metadata ?? {},
			created_at: now
		})
		.returning();

	await tx.insert(outboxEvents).values({
		org_id: input.orgId,
		event_type: 'contact.communication_preference_changed',
		event_version: 1,
		resource_type: 'contact',
		resource_id: input.contactId,
		payload,
		idempotency_key: `contact.communication_preference_changed:${eventId}`
	});

	return { changed: true, preference, event: auditEvent };
}

export async function changeCommunicationConsent(input: ChangeConsentInput) {
	return db.transaction((tx) => changeCommunicationConsentInTransaction(tx, input));
}

export async function changeCommunicationConsentInTransaction(
	tx: PreferenceTx,
	input: ChangeConsentInput
) {
	const now = new Date();
	const [contact] = await tx
		.select({ id: contacts.id })
		.from(contacts)
		.where(and(eq(contacts.org_id, input.orgId), eq(contacts.id, input.contactId)))
		.limit(1);
	if (!contact) {
		throw new CommunicationPreferenceMutationError('CONTACT_NOT_FOUND', 'Contact not found.', 404);
	}

	const [consent] = await tx
		.insert(contactCommunicationConsents)
		.values({
			org_id: input.orgId,
			contact_id: input.contactId,
			channel: input.channel,
			category: input.category,
			status: input.status,
			source: input.source,
			evidence: input.evidence ?? {},
			consented_at: input.status === 'opted_in' ? now : null,
			revoked_at: input.status === 'revoked' ? now : null,
			updated_at: now
		})
		.onConflictDoUpdate({
			target: [
				contactCommunicationConsents.org_id,
				contactCommunicationConsents.contact_id,
				contactCommunicationConsents.channel,
				contactCommunicationConsents.category
			],
			set: {
				status: input.status,
				source: input.source,
				evidence: input.evidence ?? {},
				consented_at: input.status === 'opted_in' ? now : null,
				revoked_at: input.status === 'revoked' ? now : null,
				updated_at: now
			}
		})
		.returning();

	return consent;
}

export async function listCommunicationPreferences(orgId: string, contactId: string) {
	const [preferences, events, consents] = await Promise.all([
		db
			.select()
			.from(contactCommunicationPreferences)
			.where(
				and(
					eq(contactCommunicationPreferences.org_id, orgId),
					eq(contactCommunicationPreferences.contact_id, contactId)
				)
			)
			.orderBy(desc(contactCommunicationPreferences.updated_at)),
		db
			.select()
			.from(contactCommunicationPreferenceEvents)
			.where(
				and(
					eq(contactCommunicationPreferenceEvents.org_id, orgId),
					eq(contactCommunicationPreferenceEvents.contact_id, contactId)
				)
			)
			.orderBy(desc(contactCommunicationPreferenceEvents.created_at)),
		db
			.select()
			.from(contactCommunicationConsents)
			.where(
				and(
					eq(contactCommunicationConsents.org_id, orgId),
					eq(contactCommunicationConsents.contact_id, contactId)
				)
			)
			.orderBy(desc(contactCommunicationConsents.updated_at))
	]);

	return { preferences, consents, events };
}
