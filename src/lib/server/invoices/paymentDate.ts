/**
 * Normalize a payment-date input to a Date. Accepts either a full ISO datetime (used as-is) or a
 * bare calendar date `YYYY-MM-DD` from the built Calendar — a bare date is anchored to LOCAL noon
 * so it never drifts to the previous/next day when stored as a timestamp. Missing/invalid → now.
 */
export function parsePaymentDate(input: string | undefined | null): Date {
	if (!input) return new Date();
	if (input.includes('T')) {
		const d = new Date(input);
		return Number.isNaN(d.getTime()) ? new Date() : d;
	}
	const d = new Date(`${input}T12:00:00`);
	return Number.isNaN(d.getTime()) ? new Date() : d;
}
