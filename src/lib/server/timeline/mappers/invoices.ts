import type { RawTimelineRow, TimelineEntry, TimelineRegistryEntry } from '../types';
import { fmtInvoiceNumber, fmtMoney, synthId } from './_shared';

type InvoiceRowData = {
	invoice_number: number;
	total: string | null;
	invoice_id: string;
};

export const invoiceSentRegistry: TimelineRegistryEntry = {
	source_table: 'invoices',
	kind: 'sent',
	mapper: (row) => {
		const d = row.row_data as InvoiceRowData;
		const num = fmtInvoiceNumber(d.invoice_number);
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'invoice-sent',
			tone: 'neutral',
			description: `Invoice ${num} sent — ${fmtMoney(d.total)}`,
			metadata: {
				invoice_number: d.invoice_number,
				total: d.total,
				invoice_id: d.invoice_id,
				kind: 'sent'
			},
			link: `/invoices/${d.invoice_id}`
		};
	}
};

export const invoicePaidRegistry: TimelineRegistryEntry = {
	source_table: 'invoices',
	kind: 'paid',
	mapper: (row) => {
		const d = row.row_data as InvoiceRowData;
		const num = fmtInvoiceNumber(d.invoice_number);
		return {
			type: row.source_table,
			id: synthId(row.source_table, row.row_id),
			created_at: row.effective_at.toISOString(),
			icon_key: 'invoice-paid',
			tone: 'positive',
			description: `Invoice ${num} paid in full`,
			metadata: {
				invoice_number: d.invoice_number,
				total: d.total,
				invoice_id: d.invoice_id,
				kind: 'paid'
			},
			link: `/invoices/${d.invoice_id}`
		};
	}
};
