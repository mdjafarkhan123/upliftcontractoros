// Secondary-phone type label (alt_phone). Fixed set matching the Jobber/GHL
// convention of a phone *type* (never a freeform name). Shared vocabulary +
// display strings used by the forms and the contact detail header.

export const PHONE_LABELS = ['mobile', 'home', 'work', 'fax', 'other'] as const;
export type PhoneLabel = (typeof PHONE_LABELS)[number];

export const PHONE_LABEL_DISPLAY: Record<PhoneLabel, string> = {
	mobile: 'Mobile',
	home: 'Home',
	work: 'Work',
	fax: 'Fax',
	other: 'Other'
};

export function isPhoneLabel(v: unknown): v is PhoneLabel {
	return typeof v === 'string' && (PHONE_LABELS as readonly string[]).includes(v);
}
