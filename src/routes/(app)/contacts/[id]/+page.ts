import type { PageLoad } from './$types';

export const ssr = false;

export type ContactDetailResponse = {
	contact: {
		id: string;
		org_id: string;
		full_name: string;
		email: string | null;
		phone: string;
		alt_phone: string | null;
		status: 'lead' | 'customer' | 'archived';
		lead_source: string;
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
};

export const load: PageLoad = ({ params }) => {
	return { id: params.id };
};
