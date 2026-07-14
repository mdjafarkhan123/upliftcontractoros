/**
 * Run independent async reads concurrently and get the results back BY NAME.
 *
 * This is the ergonomic companion to `Promise.all` for the app's non-negotiable "no query
 * waterfalls" rule (CLAUDE.md): awaiting independent DB calls one-after-another stacks their network
 * round-trips and is the top cause of slow endpoints. Both forms are allowed — reach for `parallel`
 * over a bare `Promise.all([...])` when the batch is large or mixed, because named results avoid the
 * silent positional-destructuring bugs a 10+ element array invites (swap two lines and the types
 * still "fit").
 *
 * Only for INDEPENDENT work. If one query needs another's *result*, await that one first, then batch
 * the rest. NEVER wrap dependent writes inside a `db.transaction(...)` with this — transactional
 * writes must stay sequential and ordered.
 *
 * Drizzle query builders are thenables, so they can be passed directly (they execute when awaited).
 * Gate a conditional/private read with `cond ? query : Promise.resolve(fallback)` so it still joins
 * the single wave instead of dropping back into a waterfall.
 *
 * @example
 * const { lineItems, milestones, invoiceCount } = await parallel({
 *   lineItems: db.select().from(jobLineItems).where(...),
 *   milestones: db.select().from(jobPaymentMilestones).where(...),
 *   invoiceCount: db.select({ c: sql<number>`count(*)::int` }).from(invoices).where(...)
 * });
 */
export async function parallel<T extends Record<string, PromiseLike<unknown>>>(
	tasks: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
	const keys = Object.keys(tasks) as (keyof T)[];
	const settled = await Promise.all(keys.map((k) => tasks[k]));
	const out = {} as { [K in keyof T]: Awaited<T[K]> };
	keys.forEach((key, i) => {
		out[key] = settled[i] as Awaited<T[typeof key]>;
	});
	return out;
}
