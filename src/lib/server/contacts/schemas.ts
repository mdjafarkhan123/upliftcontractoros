import { z } from 'zod';

export const LEAD_SOURCES = [
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'other'
] as const;

export const ADDRESS_LABELS = ['billing', 'service', 'mailing', 'other'] as const;

export const CONTACT_STATUSES = ['lead', 'customer', 'archived'] as const;

export const PREFERRED_CONTACT_METHODS = [
	'sms',
	'call',
	'email',
	'whatsapp',
	'messenger'
] as const;

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
	phone: z.string().min(1).max(40),
	email: z
		.string()
		.email()
		.max(200)
		.optional()
		.or(z.literal('').transform(() => undefined)),
	lead_source: z.enum(LEAD_SOURCES).optional(),
	assigned_to: z.string().uuid().nullish(),
	notes: optionalTrimmedString(2000),
	tags: z.array(z.string().max(50)).max(20).optional()
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
	.object({
		full_name: trimmedString(200).optional(),
		phone: z.string().min(1).max(40).optional(),
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

export const addressUpdateSchema = addressSchema.partial();
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
