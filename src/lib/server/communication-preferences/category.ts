import type { CommunicationPreferenceCategory } from '$lib/server/db/schema';

export type CustomerCommunicationCategory = Exclude<CommunicationPreferenceCategory, 'all'>;

/** Map existing queue source labels to the GHL-style preference category. */
export function communicationCategoryFromSource(
	source: string | null | undefined
): CustomerCommunicationCategory {
	const value = source ?? '';
	if (value.includes('review')) return 'review_request';
	if (value.includes('quote_followup')) return 'quote_followup';
	if (value.includes('quote')) return 'quote_send';
	if (value.includes('invoice_reminder') || value.includes('invoice_dunning'))
		return 'invoice_reminder';
	if (value.includes('invoice')) return 'invoice_send';
	if (value.includes('payment_receipt')) return 'payment_receipt';
	if (value.includes('appointment_reminder')) return 'appointment_reminder';
	if (value.includes('appointment')) return 'appointment_confirmation';
	if (value.includes('job_on_my_way')) return 'job_on_my_way';
	if (value.includes('job_scheduled')) return 'job_scheduled';
	if (value.includes('speed_to_lead')) return 'speed_to_lead';
	if (value.includes('manual')) return 'manual_message';
	return 'marketing';
}
