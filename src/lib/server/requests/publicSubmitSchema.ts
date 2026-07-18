import { z } from 'zod';

// Public request-form submission (R4 wizard: contact + consents + address →
// service details + lead source → schedule → review).
//
// R5.2: which optional fields are shown/required is per-form config now, so the
// base schema keeps address + the other configurable fields OPTIONAL and the
// submit handler enforces "required when enabled+required" against the form's
// stored field config (a client can't be trusted to have obeyed the config).
// firstName / lastName / phone / serviceDetails are LOCKED-required for every
// request form, so they stay required here.
const optionalTrimmed = (max: number) =>
	z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().trim().max(max).optional()
	);

export const submitRequestSchema = z.object({
	// Contact
	firstName: z.string().trim().min(1, 'Required').max(100),
	lastName: z.string().trim().min(1, 'Required').max(100),
	companyName: optionalTrimmed(200),
	email: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().trim().email('Invalid email').max(254).optional()
	),
	customerPhone: z.string().trim().min(1, 'Required').max(40),
	marketingEmailOptIn: z.boolean().default(false),
	marketingSmsOptIn: z.boolean().default(false),

	// Property / service address — optional at the schema layer; the handler
	// enforces requiredness per the form's field config.
	addressLine1: optionalTrimmed(200),
	addressLine2: optionalTrimmed(200),
	city: optionalTrimmed(120),
	state: optionalTrimmed(120),
	zip: optionalTrimmed(20),

	// Service details (locked-required) + "how did you hear about us" (configurable)
	serviceDetails: z.string().trim().min(1, 'Required').max(4000),
	leadSourceAnswer: optionalTrimmed(200),

	// Answers to the form's custom questions (R5.2b). Loosely typed at the schema
	// layer (value is text | text[] | null); the handler validates each answer
	// against the form's stored custom-question rows and drops unknown ids.
	customAnswers: z
		.array(
			z.object({
				field_id: z.string().uuid(),
				value: z.union([z.string().max(4000), z.array(z.string().max(400)).max(50), z.null()])
			})
		)
		.max(50)
		.optional()
		.default([]),

	// Schedule (Required — ref/req/5.jpg)
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
	slotStart: z.string().datetime({ offset: true }),

	// Attribution referrer (document.referrer)
	source: optionalTrimmed(500),
	// Honeypot — must be empty/undefined for legitimate submissions.
	website: z.string().optional()
});

export type SubmitRequestInput = z.infer<typeof submitRequestSchema>;
