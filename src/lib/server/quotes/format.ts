export function formatQuoteNumber(n: number): string {
	return `Q-${String(n).padStart(4, '0')}`;
}

export function formatCurrencyUsd(value: string | number): string {
	const v = typeof value === 'string' ? Number(value) : value;
	return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function publicQuoteUrl(baseUrl: string, token: string): string {
	return `${baseUrl.replace(/\/$/, '')}/q/${token}`;
}
