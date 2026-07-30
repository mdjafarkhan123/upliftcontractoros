import type { PageLoad } from './$types';
import type { InvoiceDetail } from '$lib/types/invoices';

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/invoices/${params.id}`);
	if (!res.ok) return { invoice: null };
	const body = await res.json();
	return { invoice: body.data as InvoiceDetail };
};
