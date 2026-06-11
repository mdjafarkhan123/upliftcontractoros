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

/**
 * Compact "time ago" for list rows — e.g. "just now", "5m ago", "3h ago",
 * "2d ago", "6w ago", then falls back to a short date for anything older.
 */
export function formatRelativeShort(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	const diffMs = Date.now() - d.getTime();
	if (isNaN(diffMs)) return '';
	const sec = Math.floor(diffMs / 1000);
	if (sec < 60) return 'just now';
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d ago`;
	const wk = Math.floor(day / 7);
	if (wk < 5) return `${wk}w ago`;
	return formatDateShort(d);
}

export function formatQuoteNumber(n: number): string {
	return `Q-${String(n).padStart(4, '0')}`;
}

export function formatInvoiceNumber(n: number): string {
	return `INV-${String(n).padStart(4, '0')}`;
}
