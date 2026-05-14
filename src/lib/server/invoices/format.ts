export function formatInvoiceNumber(n: number): string {
	return `INV-${String(n).padStart(4, '0')}`;
}

export function formatCurrencyUsd(value: string | number): string {
	const v = typeof value === 'string' ? Number(value) : value;
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
