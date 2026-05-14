const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdCents = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

export function formatCurrency(amount: number | string): string {
	const n = typeof amount === 'string' ? parseFloat(amount) : amount;
	return isNaN(n) ? '$0.00' : usd.format(n);
}

export function formatCurrencyExact(amount: number | string): string {
	const n = typeof amount === 'string' ? parseFloat(amount) : amount;
	return isNaN(n) ? '$0.00' : usdCents.format(n);
}

export function formatDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

export function formatDateTime(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function formatQuoteNumber(n: number): string {
	return `Q-${String(n).padStart(4, '0')}`;
}

export function formatInvoiceNumber(n: number): string {
	return `INV-${String(n).padStart(4, '0')}`;
}
