/**
 * Helpers shared across timeline mappers.
 *
 * Description strings are generated server-side once at normalization time
 * and treated as frozen presentation text — never regenerated client-side.
 */

const MAX_PREVIEW = 120;

export function makePreview(input: string | null | undefined): string {
	if (!input) return '';
	const collapsed = input
		.replace(/\r\n?|\n+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (collapsed.length <= MAX_PREVIEW) return collapsed;
	return collapsed.slice(0, MAX_PREVIEW - 1).trimEnd() + '…';
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function fmtMoney(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return '$0.00';
	const n = typeof value === 'string' ? parseFloat(value) : value;
	return Number.isFinite(n) ? usd.format(n) : '$0.00';
}

export function fmtQuoteNumber(n: number | null | undefined): string {
	return n ? `Q-${String(n).padStart(4, '0')}` : 'Q-????';
}

export function fmtInvoiceNumber(n: number | null | undefined): string {
	return n ? `INV-${String(n).padStart(4, '0')}` : 'INV-????';
}

export function fmtApptWhen(iso: string | Date | null | undefined): string {
	if (!iso) return '';
	const d = typeof iso === 'string' ? new Date(iso) : iso;
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function synthId(source_table: string, row_id: string): string {
	return `${source_table}:${row_id}`;
}
