// Client-safe form-builder types + metadata (R5.2).
//
// Shared by the public RequestWizard (which fields to render + require) and the
// Settings form-builder UI (which toggles to show). Pure data — NO server
// imports — so both a `.svelte` file and `$lib/server/*` can pull from it.

export type StandardFieldKey =
	| 'first_name'
	| 'last_name'
	| 'company_name'
	| 'email'
	| 'phone'
	| 'address'
	| 'service_details'
	| 'photos'
	| 'lead_source';

// The configurable subset — the fields the builder lets a contractor toggle.
// (name / phone / service_details are LOCKED and never appear as toggles.)
export const CONFIGURABLE_FIELD_KEYS = [
	'company_name',
	'email',
	'address',
	'photos',
	'lead_source'
] as const satisfies readonly StandardFieldKey[];

export interface StandardFieldMeta {
	key: StandardFieldKey;
	/** Builder-facing name of the field. */
	label: string;
	/** One-line helper shown under the toggle in the builder. */
	description: string;
	/** Locked = always shown + required; no toggle in the builder (Jobber parity). */
	locked: boolean;
	defaultEnabled: boolean;
	defaultRequired: boolean;
	/** Whether a "Required" toggle is meaningful (locked fields are always required). */
	canRequire: boolean;
}

// The full ordered set of standardized fields on a request form. Order matches
// the public wizard (contact → address → service details → photos → lead source)
// and reproduces the pre-R5.2 hardcoded behavior when left at defaults.
export const REQUEST_STANDARD_FIELDS: StandardFieldMeta[] = [
	{
		key: 'first_name',
		label: 'First name',
		description: 'Always collected.',
		locked: true,
		defaultEnabled: true,
		defaultRequired: true,
		canRequire: false
	},
	{
		key: 'last_name',
		label: 'Last name',
		description: 'Always collected.',
		locked: true,
		defaultEnabled: true,
		defaultRequired: true,
		canRequire: false
	},
	{
		key: 'company_name',
		label: 'Company name',
		description: "Show a company field for commercial clients.",
		locked: false,
		defaultEnabled: true,
		defaultRequired: false,
		canRequire: true
	},
	{
		key: 'email',
		label: 'Email',
		description: 'Email address plus the marketing-email opt-in.',
		locked: false,
		defaultEnabled: true,
		defaultRequired: false,
		canRequire: true
	},
	{
		key: 'phone',
		label: 'Phone number',
		description: 'Always collected — needed to reach the client.',
		locked: true,
		defaultEnabled: true,
		defaultRequired: true,
		canRequire: false
	},
	{
		key: 'address',
		label: 'Street address',
		description: 'The property address where the work happens.',
		locked: false,
		defaultEnabled: true,
		defaultRequired: true,
		canRequire: true
	},
	{
		key: 'service_details',
		label: 'Service details',
		description: 'Always collected — the client describes the work.',
		locked: true,
		defaultEnabled: true,
		defaultRequired: true,
		canRequire: false
	},
	{
		key: 'photos',
		label: 'Photos',
		description: 'Let clients attach up to 10 images of the work.',
		locked: false,
		defaultEnabled: true,
		defaultRequired: false,
		// Photos upload AFTER the request is created (best-effort), so "required"
		// can't be reliably enforced server-side yet — show/hide only for now.
		canRequire: false
	},
	{
		key: 'lead_source',
		label: 'How did you hear about us?',
		description: 'Track where your leads come from.',
		locked: false,
		defaultEnabled: true,
		defaultRequired: false,
		canRequire: true
	}
];

export const REQUEST_STANDARD_FIELD_META: Record<StandardFieldKey, StandardFieldMeta> =
	Object.fromEntries(REQUEST_STANDARD_FIELDS.map((f) => [f.key, f])) as Record<
		StandardFieldKey,
		StandardFieldMeta
	>;

// The compact per-field config the API returns and the wizard consumes.
export interface StandardFieldConfig {
	key: StandardFieldKey;
	enabled: boolean;
	required: boolean;
}

// A full builder row (settings UI) — the DB row projected to what the panel needs.
export interface BuilderFormField {
	id: string;
	key: StandardFieldKey;
	enabled: boolean;
	required: boolean;
	locked: boolean;
	position: number;
}

/**
 * Resolve the effective config for a standardized field from a list of configs.
 * Falls back to the field's defaults when the form has no row for it (defensive —
 * every request form should have rows, but public reads must never break).
 */
export function fieldConfig(
	configs: StandardFieldConfig[] | undefined,
	key: StandardFieldKey
): { enabled: boolean; required: boolean } {
	const found = configs?.find((c) => c.key === key);
	if (found) return { enabled: found.enabled, required: found.required };
	const meta = REQUEST_STANDARD_FIELD_META[key];
	return { enabled: meta.defaultEnabled, required: meta.defaultRequired };
}

// ── Custom questions (R5.2b) ─────────────────────────────────────────────────
// Contractor-added questions on a request form (Jobber "Add Questions").
// Stored as booking_form_fields rows with kind='custom'; answered rows land in
// request_field_answers. `question_type` is stored as plain text (see the schema
// comment) so this union is the single source of truth for valid values.

export type CustomQuestionType =
	| 'short_text'
	| 'long_text'
	| 'dropdown_single'
	| 'dropdown_multi'
	| 'checkbox'
	| 'radio'
	| 'number'
	| 'yes_no'
	| 'date';

export interface CustomQuestionTypeMeta {
	type: CustomQuestionType;
	/** Builder-facing name (the "Add Questions" list). */
	label: string;
	/** Remix icon class for the type button. */
	icon: string;
	/** Choice types carry an `options` list (dropdown / checkbox / radio). */
	hasOptions: boolean;
	/** Multi-value answers (checkbox group + multi-select dropdown) — stored as string[]. */
	multi: boolean;
}

// Order matches Jobber's "Add Questions" panel (imgs 14–15). "Area" is deferred
// to R5.2c (it's a property-measurement widget, not a simple field).
export const CUSTOM_QUESTION_TYPES: CustomQuestionTypeMeta[] = [
	{ type: 'short_text', label: 'Short answer', icon: 'ri-text', hasOptions: false, multi: false },
	{
		type: 'long_text',
		label: 'Long answer',
		icon: 'ri-align-left',
		hasOptions: false,
		multi: false
	},
	{
		type: 'dropdown_multi',
		label: 'Dropdown (multiple choice)',
		icon: 'ri-arrow-down-s-line',
		hasOptions: true,
		multi: true
	},
	{
		type: 'dropdown_single',
		label: 'Dropdown (single choice)',
		icon: 'ri-arrow-down-s-line',
		hasOptions: true,
		multi: false
	},
	{ type: 'checkbox', label: 'Checkbox', icon: 'ri-checkbox-line', hasOptions: true, multi: true },
	{
		type: 'radio',
		label: 'Radio button (single choice)',
		icon: 'ri-radio-button-line',
		hasOptions: true,
		multi: false
	},
	{
		type: 'number',
		label: 'Numerical answer',
		icon: 'ri-hashtag',
		hasOptions: false,
		multi: false
	},
	{
		type: 'yes_no',
		label: 'Yes/No toggle',
		icon: 'ri-toggle-line',
		hasOptions: false,
		multi: false
	},
	{ type: 'date', label: 'Date picker', icon: 'ri-calendar-line', hasOptions: false, multi: false }
];

export const CUSTOM_QUESTION_TYPE_META: Record<CustomQuestionType, CustomQuestionTypeMeta> =
	Object.fromEntries(CUSTOM_QUESTION_TYPES.map((t) => [t.type, t])) as Record<
		CustomQuestionType,
		CustomQuestionTypeMeta
	>;

export function customTypeHasOptions(type: CustomQuestionType): boolean {
	return CUSTOM_QUESTION_TYPE_META[type]?.hasOptions ?? false;
}

export function customTypeIsMulti(type: CustomQuestionType): boolean {
	return CUSTOM_QUESTION_TYPE_META[type]?.multi ?? false;
}

// A custom question row projected for the settings builder (edit surface).
export interface BuilderCustomField {
	id: string;
	type: CustomQuestionType;
	label: string;
	help_text: string | null;
	placeholder: string | null;
	options: string[];
	required: boolean;
	position: number;
}

// What the public wizard needs to render a custom question (no position/order
// concerns — the wizard renders them in the order it receives them).
export interface PublicCustomField {
	id: string;
	type: CustomQuestionType;
	label: string;
	help_text: string | null;
	placeholder: string | null;
	options: string[];
	required: boolean;
}

// One answer the wizard submits. `value` is a plain string for single-value
// types, string[] for multi-value types (checkbox / multi-dropdown), or null
// when unanswered.
export interface CustomAnswerInput {
	field_id: string;
	value: string | string[] | null;
}
