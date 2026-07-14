import type { JobCosting } from '$lib/types/jobs';

const round2 = (n: number): number => Math.round(n * 100) / 100;

type LineForCost = { quantity: string; unit_cost: string | null };
type ExpenseForCost = { amount: string };
// Only CLOSED entries carry cost — a running timer (clock_out null) hasn't finalized its hours
// or rate snapshot yet, so it contributes $0 until stopped (matches the hourly_rate_snapshot
// capture point in the time-entry routes).
type TimeEntryForCost = { duration_minutes: string | null; hourly_rate_snapshot: string | null };

/**
 * Compute a job's profitability from data already fetched by the caller (no queries here).
 *
 * revenue      = subtotal − discount  (pre-tax value of the WORK; tax is pass-through, not income)
 * line cost    = Σ quantity × unit_cost over lines that actually carry a cost (blank ≠ zero cost)
 * labor cost   = Σ (duration_minutes / 60) × hourly_rate_snapshot over closed time entries
 *                (Session 2 timesheets). An entry with no rate snapshot (member has no hourly
 *                cost rate set) contributes $0 hours worked still show, just no cost.
 * expense total= Σ expense.amount
 * cost total   = line cost + labor + expenses
 * profit       = revenue − cost total
 * margin       = profit / revenue (whole %), or null when revenue is 0 (undefined margin)
 *
 * Mirrors the money order used by recalcJobTotals so the numbers reconcile with the line-item
 * table the contractor sees right above the costing panel.
 */
export function computeJobCosting(input: {
	subtotal: string;
	discount_amount: string | null;
	lineItems: LineForCost[];
	expenses: ExpenseForCost[];
	timeEntries?: TimeEntryForCost[];
}): JobCosting {
	const revenue = round2(Number(input.subtotal) - Number(input.discount_amount ?? 0));

	let lineCost = 0;
	for (const li of input.lineItems) {
		if (li.unit_cost == null || String(li.unit_cost).trim() === '') continue;
		const q = Number(li.quantity);
		const c = Number(li.unit_cost);
		if (Number.isFinite(q) && Number.isFinite(c)) lineCost += q * c;
	}
	lineCost = round2(lineCost);

	let laborCost = 0;
	for (const t of input.timeEntries ?? []) {
		if (t.duration_minutes == null || t.hourly_rate_snapshot == null) continue;
		const minutes = Number(t.duration_minutes);
		const rate = Number(t.hourly_rate_snapshot);
		if (Number.isFinite(minutes) && Number.isFinite(rate)) laborCost += (minutes / 60) * rate;
	}
	laborCost = round2(laborCost);

	let expenseTotal = 0;
	for (const e of input.expenses) {
		const a = Number(e.amount);
		if (Number.isFinite(a)) expenseTotal += a;
	}
	expenseTotal = round2(expenseTotal);

	const costTotal = round2(lineCost + laborCost + expenseTotal);
	const profit = round2(revenue - costTotal);
	const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : null;

	return {
		revenue: revenue.toFixed(2),
		line_item_cost: lineCost.toFixed(2),
		labor_cost: laborCost.toFixed(2),
		expense_total: expenseTotal.toFixed(2),
		cost_total: costTotal.toFixed(2),
		profit: profit.toFixed(2),
		margin_pct: marginPct
	};
}
