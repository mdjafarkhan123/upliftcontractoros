import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { fmtMoney, synthId } from './_shared';

type PaymentRowData = {
	amount: string | null;
	payment_method: string | null;
	invoice_id: string | null;
};

const METHOD_LABEL: Record<string, string> = {
	stripe: 'Stripe',
	cash: 'cash',
	check: 'check',
	bank_transfer: 'bank transfer',
	other: 'other'
};

export const paymentRegistry: TimelineRegistryEntry = {
	source_table: 'payments',
	kind: '',
	mapper: (row) => {
		const d = row.row_data as PaymentRowData;
		const methodLabel = d.payment_method ? METHOD_LABEL[d.payment_method] ?? d.payment_method : null;
		// Keep description compact (< 140 chars). Stripe method is implied
		// most of the time; only annotate when it's a non-default method.
		const description =
			methodLabel && d.payment_method !== 'stripe'
				? `Payment received — ${fmtMoney(d.amount)} (${methodLabel})`
				: `Payment received — ${fmtMoney(d.amount)}`;
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'payment',
			tone: 'positive',
			description,
			metadata: {
				amount: d.amount,
				payment_method: d.payment_method,
				invoice_id: d.invoice_id
			},
			link: d.invoice_id ? `/invoices/${d.invoice_id}` : null
		};
	}
};
