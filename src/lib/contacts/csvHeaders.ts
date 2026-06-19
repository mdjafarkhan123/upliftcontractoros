// Client-safe CSV header vocabulary for contact import. Lives outside
// $lib/server so BOTH the server import pipeline (csvImport.ts, the worker) and
// the client import modal can share ONE source of truth — the modal uses it to
// show a "Mapped / Ignored columns" hint, and that hint must never drift from
// what the server actually maps. Pure data + a pure function: no server deps.

export function normalizeKey(h: string): string {
	return h.toLowerCase().replace(/[\s_\-]+/g, '_');
}

export const HEADER_MAP: Record<string, string> = {
	full_name: 'full_name',
	name: 'full_name',
	contact_name: 'full_name',
	// Split-name columns — combined into full_name when no single name column exists.
	first_name: 'first_name',
	firstname: 'first_name',
	given_name: 'first_name',
	last_name: 'last_name',
	lastname: 'last_name',
	surname: 'last_name',
	family_name: 'last_name',
	phone: 'phone',
	phone_number: 'phone',
	mobile: 'phone',
	cell: 'phone',
	alt_phone: 'alt_phone',
	alternate_phone: 'alt_phone',
	secondary_phone: 'alt_phone',
	alt_phone_number: 'alt_phone',
	email: 'email',
	email_address: 'email',
	company: 'company_name',
	company_name: 'company_name',
	business: 'company_name',
	business_name: 'company_name',
	organization: 'company_name',
	status: 'status',
	lead_source: 'lead_source',
	source: 'lead_source',
	tags: 'tags',
	tag: 'tags',
	notes: 'notes',
	note: 'notes',
	description: 'notes',
	// Flat address columns → a primary service address row (created by the worker).
	address: 'address_line_1',
	address_line_1: 'address_line_1',
	address1: 'address_line_1',
	street: 'address_line_1',
	street_address: 'address_line_1',
	address_line_2: 'address_line_2',
	address2: 'address_line_2',
	suite: 'address_line_2',
	unit: 'address_line_2',
	apt: 'address_line_2',
	city: 'city',
	town: 'city',
	state: 'state',
	province: 'state',
	region: 'state',
	zip: 'zip',
	zip_code: 'zip',
	postal_code: 'zip',
	postcode: 'zip'
};

// Friendly labels for the canonical fields HEADER_MAP resolves to — used by the
// import modal's "Mapped" hint so the user sees plain names, not snake_case.
export const CANONICAL_FIELD_LABELS: Record<string, string> = {
	full_name: 'Name',
	first_name: 'First name',
	last_name: 'Last name',
	phone: 'Phone',
	alt_phone: 'Alt phone',
	email: 'Email',
	company_name: 'Company',
	status: 'Status',
	lead_source: 'Lead source',
	tags: 'Tags',
	notes: 'Notes',
	address_line_1: 'Address',
	address_line_2: 'Address line 2',
	city: 'City',
	state: 'State',
	zip: 'Zip'
};
