import type { JobCustomFieldType } from '$lib/types/jobs';
import type { JobCustomFieldValueInput } from './schemas';

// The four typed answer columns on job_custom_field_values.
export type CustomFieldValueColumns = {
	value_text: string | null;
	value_number: string | null;
	value_bool: boolean | null;
	value_date: string | null;
};

const EMPTY_COLUMNS: CustomFieldValueColumns = {
	value_text: null,
	value_number: null,
	value_bool: null,
	value_date: null
};

// Prepend https:// to a bare URL (matches Jobber, which stores clickable links). Left as-is
// when it already carries a scheme. Never throws — validation is a light touch here.
function normalizeLink(raw: string): string {
	const t = raw.trim();
	if (!t) return t;
	return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/**
 * Route an incoming answer to the single column that matches the field's type; every other
 * column is null. Only the type-appropriate value is honored, so a client can't smuggle a value
 * into the wrong column. A `link` field is stored in value_text (URL-normalized).
 */
export function resolveCustomFieldColumns(
	fieldType: JobCustomFieldType,
	input: JobCustomFieldValueInput
): CustomFieldValueColumns {
	switch (fieldType) {
		case 'short_text':
			return { ...EMPTY_COLUMNS, value_text: input.value_text?.trim() || null };
		case 'link': {
			const t = input.value_text?.trim();
			return { ...EMPTY_COLUMNS, value_text: t ? normalizeLink(t) : null };
		}
		case 'dropdown':
			return { ...EMPTY_COLUMNS, value_text: input.value_text?.trim() || null };
		case 'number':
			return {
				...EMPTY_COLUMNS,
				value_number: input.value_number == null ? null : String(input.value_number)
			};
		case 'checkbox':
			return { ...EMPTY_COLUMNS, value_bool: input.value_bool ?? null };
		case 'date':
			return { ...EMPTY_COLUMNS, value_date: input.value_date ?? null };
	}
}

// Whether the resolved value counts as "filled" — used for the required-field gate. A checkbox
// counts as filled only when TRUE (matches Jobber: a required checkbox must be ticked).
export function isCustomFieldFilled(
	fieldType: JobCustomFieldType,
	cols: CustomFieldValueColumns
): boolean {
	switch (fieldType) {
		case 'checkbox':
			return cols.value_bool === true;
		case 'number':
			return cols.value_number != null;
		case 'date':
			return cols.value_date != null;
		default:
			return !!cols.value_text;
	}
}
