// Lead temperature — sales-priority signal on a contact, distinct from lifecycle
// `status`. Shared vocabulary + presentation tokens used by the list card, table,
// detail header, forms, and filter control.

export const LEAD_TEMPERATURES = ['hot', 'warm', 'cold'] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

type TemperatureMeta = {
	label: string;
	/** solid dot color (compact list contexts) */
	dot: string;
	/** full pill classes (badges) */
	badge: string;
};

export const TEMPERATURE_META: Record<LeadTemperature, TemperatureMeta> = {
	hot: {
		label: 'Hot',
		dot: 'bg-orange-500',
		badge:
			'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400'
	},
	warm: {
		label: 'Warm',
		dot: 'bg-amber-500',
		badge:
			'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400'
	},
	cold: {
		label: 'Cold',
		dot: 'bg-sky-500',
		badge:
			'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400'
	}
};

export function isLeadTemperature(v: unknown): v is LeadTemperature {
	return typeof v === 'string' && (LEAD_TEMPERATURES as readonly string[]).includes(v);
}
