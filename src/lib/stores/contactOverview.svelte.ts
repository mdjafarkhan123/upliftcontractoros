import { createDetailCache } from './detailCache.svelte';

export type ContactOverviewResponse = {
	open_quotes: {
		items: Array<{
			id: string;
			quote_number: number;
			title: string;
			status: 'draft' | 'sent' | 'viewed' | 'changes_requested';
			total: number;
			created_at: string;
		}>;
		count: number;
	};
	active_jobs: {
		items: Array<{
			id: string;
			title: string;
			// active_jobs lists only open jobs (Jobber model: active vs archived).
			status: 'active';
			scheduled_start: string | null;
			is_recurring: boolean;
			has_series_anchor: boolean;
			next_open_visit_start: string | null;
			has_open_visits: boolean;
			total: number;
		}>;
		count: number;
	};
	unpaid_invoices: {
		items: Array<{
			id: string;
			invoice_number: number;
			title: string;
			status: 'sent' | 'partially_paid' | 'overdue';
			total: number;
			amount_due: number;
			due_date: string | null;
		}>;
		count: number;
	};
	upcoming_appointments: {
		items: Array<{
			id: string;
			title: string;
			scheduled_start: string;
			scheduled_end: string | null;
			location: string | null;
		}>;
		count: number;
	};
};

async function fetchContactOverview(
	id: string,
	signal: AbortSignal
): Promise<ContactOverviewResponse> {
	const res = await fetch(`/api/contacts/${id}/overview`, { signal });
	if (res.status === 404) throw new Error('Contact not found.');
	if (res.status === 403) throw new Error('You do not have access to this contact.');
	if (!res.ok) throw new Error('Failed to load overview.');
	return (await res.json()) as ContactOverviewResponse;
}

export const contactOverviewStore = createDetailCache(fetchContactOverview);
