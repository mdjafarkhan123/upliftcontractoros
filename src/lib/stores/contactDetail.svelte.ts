import { createDetailCache } from './detailCache.svelte';

export type ContactDetailResponse = {
	contact: {
		id: string;
		org_id: string;
		full_name: string;
		company_name: string | null;
		avatar_url: string | null;
		email: string | null;
		phone: string;
		alt_phone: string | null;
		alt_phone_label: 'mobile' | 'home' | 'work' | 'fax' | 'other' | null;
		status: 'lead' | 'customer' | 'archived';
		lead_source: string;
		lead_temperature: 'hot' | 'warm' | 'cold' | null;
		assigned_to: string | null;
		referred_by_contact_id: string | null;
		sms_opt_out: boolean;
		sms_opt_out_at: string | null;
		sms_opt_out_source: string | null;
		sms_opted_in_at: string | null;
		notes: string | null;
		tags: string[];
		last_contacted_at: string | null;
		next_follow_up_at: string | null;
		converted_at: string | null;
		preferred_contact_method: 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger' | null;
		email_opt_in: boolean;
		do_not_contact: boolean;
		do_not_contact_at: string | null;
		created_at: string;
		updated_at: string;
	};
	assignee: { id: string; name: string } | null;
	referrer: { id: string; name: string } | null;
	referral_count: number;
	addresses: Array<{
		id: string;
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string | null;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
		updated_at: string;
	}>;
	notes: Array<{
		id: string;
		content: string;
		author_id: string | null;
		author_name: string | null;
		created_at: string;
	}>;
	counts: {
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	};
	kpi: {
		lifetime_revenue: number;
		open_quotes_count: number;
		open_quotes_value: number;
		active_jobs_count: number;
	};
};

async function fetchContactDetail(id: string, signal: AbortSignal): Promise<ContactDetailResponse> {
	const res = await fetch(`/api/contacts/${id}`, { signal });
	if (res.status === 404) throw new Error('Contact not found.');
	if (res.status === 403) throw new Error('You do not have access to this contact.');
	if (!res.ok) throw new Error('Failed to load contact.');
	return (await res.json()) as ContactDetailResponse;
}

export const contactDetailStore = createDetailCache(fetchContactDetail);
