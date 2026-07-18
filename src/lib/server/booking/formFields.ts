// Server-side form-builder helpers (R5.2). Seeding defaults, projecting DB rows
// to the client-safe config shapes, and validating builder updates.

import { z } from 'zod';
import type { BookingFormField, NewBookingFormField } from '$lib/server/db/schema';
import {
	REQUEST_STANDARD_FIELDS,
	CUSTOM_QUESTION_TYPES,
	customTypeHasOptions,
	type BuilderFormField,
	type BuilderCustomField,
	type PublicCustomField,
	type CustomQuestionType,
	type StandardFieldConfig,
	type StandardFieldKey
} from '$lib/types/bookingForms';

// The rows to insert when a request form is created (or backfilled). Mirrors the
// migration backfill so new and existing forms are identical.
export function defaultRequestFormFieldRows(
	orgId: string,
	bookingLinkId: string
): NewBookingFormField[] {
	return REQUEST_STANDARD_FIELDS.map((f, i) => ({
		org_id: orgId,
		booking_link_id: bookingLinkId,
		kind: 'standard' as const,
		standard_key: f.key,
		is_enabled: f.defaultEnabled,
		is_required: f.defaultRequired,
		is_locked: f.locked,
		position: i
	}));
}

// Only standardized rows drive the public wizard in R5.2a. Custom rows (R5.2b)
// are ignored here.
export function toStandardFieldConfigs(rows: BookingFormField[]): StandardFieldConfig[] {
	return rows
		.filter((r) => r.kind === 'standard' && r.standard_key !== null)
		.sort((a, b) => a.position - b.position)
		.map((r) => ({
			key: r.standard_key as StandardFieldKey,
			enabled: r.is_enabled,
			required: r.is_required
		}));
}

// The richer projection the settings builder panel needs (keeps id + locked).
export function toBuilderFields(rows: BookingFormField[]): BuilderFormField[] {
	return rows
		.filter((r) => r.kind === 'standard' && r.standard_key !== null)
		.sort((a, b) => a.position - b.position)
		.map((r) => ({
			id: r.id,
			key: r.standard_key as StandardFieldKey,
			enabled: r.is_enabled,
			required: r.is_required,
			locked: r.is_locked,
			position: r.position
		}));
}

// PATCH /api/booking-links/[id]/fields body — a list of per-field updates keyed
// by the row id. Locked rows are rejected server-side (they can't be reconfigured).
export const updateFormFieldsSchema = z.object({
	fields: z
		.array(
			z.object({
				id: z.string().uuid(),
				is_enabled: z.boolean(),
				is_required: z.boolean()
			})
		)
		.min(1)
		.max(50)
});

export type UpdateFormFieldsInput = z.infer<typeof updateFormFieldsSchema>;

// ── Custom questions (R5.2b) ─────────────────────────────────────────────────

const CUSTOM_TYPES = CUSTOM_QUESTION_TYPES.map((t) => t.type) as [
	CustomQuestionType,
	...CustomQuestionType[]
];

// A custom row's `options` column is jsonb; normalize whatever's stored into a
// clean string[] (defensive — never trust the DB blob shape at the type level).
function normalizeOptions(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((o): o is string => typeof o === 'string');
}

// Custom rows → builder projection (settings edit surface), position-ordered.
export function toBuilderCustomFields(rows: BookingFormField[]): BuilderCustomField[] {
	return rows
		.filter((r) => r.kind === 'custom' && r.question_type !== null)
		.sort((a, b) => a.position - b.position)
		.map((r) => ({
			id: r.id,
			type: r.question_type as CustomQuestionType,
			label: r.label ?? '',
			help_text: r.help_text,
			placeholder: r.placeholder,
			options: normalizeOptions(r.options),
			required: r.is_required,
			position: r.position
		}));
}

// Custom rows → public wizard projection. Only ENABLED questions are rendered.
export function toPublicCustomFields(rows: BookingFormField[]): PublicCustomField[] {
	return rows
		.filter((r) => r.kind === 'custom' && r.question_type !== null && r.is_enabled)
		.sort((a, b) => a.position - b.position)
		.map((r) => ({
			id: r.id,
			type: r.question_type as CustomQuestionType,
			label: r.label ?? '',
			help_text: r.help_text,
			placeholder: r.placeholder,
			options: normalizeOptions(r.options),
			required: r.is_required
		}));
}

// Shared body for creating/editing a custom question. Choice types must carry at
// least one non-empty option; non-choice types must not carry options. Options
// are trimmed + de-blanked here so the row is always clean.
const customQuestionBody = z
	.object({
		type: z.enum(CUSTOM_TYPES),
		label: z.string().trim().min(1, 'Question label is required').max(200),
		help_text: z.preprocess(
			(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
			z.string().trim().max(500).nullable().default(null)
		),
		placeholder: z.preprocess(
			(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
			z.string().trim().max(200).nullable().default(null)
		),
		options: z
			.array(z.string().trim().max(200))
			.max(50)
			.optional()
			.default([])
			.transform((arr) => arr.map((o) => o.trim()).filter((o) => o.length > 0)),
		is_required: z.boolean().default(false)
	})
	.superRefine((val, ctx) => {
		if (customTypeHasOptions(val.type)) {
			if (val.options.length < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['options'],
					message: 'Add at least one option.'
				});
			}
		}
	});

export const createCustomQuestionSchema = customQuestionBody;
export const updateCustomQuestionSchema = customQuestionBody;
export type CustomQuestionInput = z.infer<typeof customQuestionBody>;
