import type { RequestLineItemInput } from './schemas';

// Turns validated line-item input into insert values, shared by POST /api/requests
// and the PATCH wipe-and-reinsert. `total` is always computed server-side
// (quantity × unit_price, cents-rounded) — never trusted from the client.
export function toLineItemValues(orgId: string, requestId: string, items: RequestLineItemInput[]) {
	return items.map((li, i) => ({
		org_id: orgId,
		request_id: requestId,
		...(li.line_key ? { line_key: li.line_key } : {}),
		description: li.description,
		details: li.details ?? null,
		quantity: String(li.quantity),
		unit: li.unit ?? null,
		unit_price: li.unit_price.toFixed(2),
		unit_cost: li.unit_cost != null ? li.unit_cost.toFixed(2) : null,
		taxable: li.taxable,
		source_catalog_item_id: li.source_catalog_item_id ?? null,
		total: (Math.round(li.quantity * li.unit_price * 100) / 100).toFixed(2),
		position: i
	}));
}
