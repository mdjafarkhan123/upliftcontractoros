import { z } from 'zod';

export const LEAD_SOURCES = [
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'google_ads',
	'yelp',
	'angi',
	'facebook',
	'nextdoor',
	'door_hanger',
	'job_sign',
	'repeat_customer',
	'other'
] as const;

export const ADDRESS_LABELS = ['billing', 'service', 'mailing', 'other'] as const;

export const CONTACT_STATUSES = ['lead', 'customer', 'archived'] as const;

export const LEAD_TEMPERATURES = ['hot', 'warm', 'cold'] as const;

export const PHONE_LABELS = ['mobile', 'home', 'work', 'fax', 'other'] as const;

export const PREFERRED_CONTACT_METHODS = ['sms', 'call', 'email', 'whatsapp', 'messenger'] as const;

const trimmedString = (max: number) =>
	z
		.string()
		.transform((v) => v.trim())
		.pipe(z.string().min(1).max(max));

const optionalTrimmedString = (max: number) =>
	z
		.string()
		.transform((v) => v.trim())
		.pipe(z.string().max(max))
		.optional()
		.transform((v) => (v && v.length > 0 ? v : undefined));

export const createContactSchema = z.object({
	full_name: trimmedString(200),
	company_name: optionalTrimmedString(200),
	lead_temperature: z.enum(LEAD_TEMPERATURES).optional(),
	// Optional since the Messenger channel — a contact may be identified by a PSID
	// (or email) with no phone. Empty/whitespace normalizes to undefined; when
	// present it is E.164-validated in the route.
	phone: z
		.string()
		.max(40)
		.optional()
		.transform((v) => {
			const t = v?.trim();
			return t && t.length > 0 ? t : undefined;
		}),
	alt_phone: z
		.string()
		.max(40)
		.optional()
		.transform((v) => {
			const t = v?.trim();
			return t && t.length > 0 ? t : undefined;
		}),
	alt_phone_label: z.enum(PHONE_LABELS).optional(),
	email: z
		.string()
		.email()
		.max(200)
		.optional()
		.or(z.literal('').transform(() => undefined)),
	lead_source: z.enum(LEAD_SOURCES).optional(),
	assigned_to: z.string().uuid().nullish(),
	referred_by_contact_id: z.string().uuid().nullish(),
	notes: optionalTrimmedString(2000),
	tags: z.array(z.string().max(50)).max(20).optional()
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
	.object({
		full_name: trimmedString(200).optional(),
		company_name: z
			.string()
			.max(200)
			.nullable()
			.optional()
			.transform((v) => {
				if (v === null) return null;
				const t = v?.trim();
				return t && t.length > 0 ? t : null;
			}),
		lead_temperature: z.enum(LEAD_TEMPERATURES).nullable().optional(),
		// Empty/whitespace normalizes to undefined → treated as "no change" by the
		// PATCH route (never clears an existing phone; that goes through the
		// release-phone reservation flow). A present value is E.164-validated there.
		phone: z
			.string()
			.max(40)
			.optional()
			.transform((v) => {
				const t = v?.trim();
				return t && t.length > 0 ? t : undefined;
			}),
		alt_phone: z
			.string()
			.max(40)
			.nullable()
			.optional()
			.transform((v) => {
				if (v === null) return null;
				const t = v?.trim();
				return t && t.length > 0 ? t : null;
			}),
		alt_phone_label: z.enum(PHONE_LABELS).nullable().optional(),
		email: z
			.string()
			.email()
			.max(200)
			.nullable()
			.optional()
			.or(z.literal('').transform(() => null)),
		lead_source: z.enum(LEAD_SOURCES).optional(),
		status: z.enum(CONTACT_STATUSES).optional(),
		assigned_to: z.string().uuid().nullable().optional(),
		referred_by_contact_id: z.string().uuid().nullable().optional(),
		notes: z
			.string()
			.max(2000)
			.nullable()
			.optional()
			.or(z.literal('').transform(() => null)),
		tags: z.array(z.string().max(50)).max(20).optional(),
		next_follow_up_at: z
			.string()
			.datetime({ offset: true })
			.nullable()
			.optional()
			.or(z.literal('').transform(() => null)),
		preferred_contact_method: z
			.enum(PREFERRED_CONTACT_METHODS)
			.nullable()
			.optional()
			.or(z.literal('').transform(() => null)),
		email_opt_in: z.boolean().optional(),
		do_not_contact: z.boolean().optional(),
		// Profile photo. Carries the id of an uploaded media row (purpose_tag
		// 'contact_avatar'); the route resolves it to the stored r2_key. null clears.
		avatar_url: z.string().uuid().nullable().optional(),
		updated_at: z.string().datetime({ offset: true }).optional()
	})
	.strict();

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const addressSchema = z.object({
	label: z.enum(ADDRESS_LABELS).default('service'),
	address_line_1: trimmedString(200),
	address_line_2: optionalTrimmedString(200),
	city: trimmedString(120),
	state: trimmedString(80),
	zip: trimmedString(20),
	is_primary: z.boolean().optional()
});

export type AddressInput = z.infer<typeof addressSchema>;

export const addressUpdateSchema = addressSchema.partial().extend({
	// Optimistic concurrency token — the updated_at the client last read. When
	// present and stale, the PATCH is rejected with 409 so a concurrent edit by
	// another team member is never silently overwritten.
	updated_at: z.string().datetime({ offset: true }).optional()
});
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;

export const noteSchema = z.object({
	content: trimmedString(4000)
});

export type NoteInput = z.infer<typeof noteSchema>;

export const releasePhoneSchema = z.object({
	confirm: z.literal(true),
	reason: trimmedString(500)
});

export type ReleasePhoneInput = z.infer<typeof releasePhoneSchema>;

// Merge: [id] route param is the survivor; `source_id` is the contact absorbed
// into it (reparented then soft-deleted). Equality is rejected by the route.
export const mergeContactSchema = z.object({
	source_id: z.string().uuid()
});

export type MergeContactInput = z.infer<typeof mergeContactSchema>;

// Bulk list actions. Discriminated on `action`. `contact_ids` is capped to keep
// a single admin tap from running an unbounded transaction.
const BULK_MAX = 100;
const contactIds = z.array(z.string().uuid()).min(1).max(BULK_MAX);
const bulkTags = z.array(z.string().max(50)).min(1).max(20);

export const bulkContactActionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('assign'),
		contact_ids: contactIds,
		assigned_to: z.string().uuid().nullable()
	}),
	z.object({
		action: z.literal('tag_add'),
		contact_ids: contactIds,
		tags: bulkTags
	}),
	z.object({
		action: z.literal('tag_remove'),
		contact_ids: contactIds,
		tags: bulkTags
	}),
	z.object({
		action: z.literal('archive'),
		contact_ids: contactIds
	}),
	z.object({
		action: z.literal('unarchive'),
		contact_ids: contactIds
	}),
	z.object({
		action: z.literal('delete'),
		contact_ids: contactIds
	})
]);

export type BulkContactActionInput = z.infer<typeof bulkContactActionSchema>;
