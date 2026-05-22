import { z } from 'zod';

export const submitBookingSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
	slotStart: z.string().datetime({ offset: true }),
	customerName: z.string().trim().min(1, 'Required').max(200),
	customerPhone: z.string().trim().min(1, 'Required').max(40),
	customerEmail: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().email('Invalid email').max(254).optional()
	),
	notes: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().max(2000).optional()
	),
	source: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
		z.string().max(500).optional()
	),
	// Honeypot — must be empty/undefined for legitimate submissions.
	website: z.string().optional()
});

export type SubmitBookingInput = z.infer<typeof submitBookingSchema>;
