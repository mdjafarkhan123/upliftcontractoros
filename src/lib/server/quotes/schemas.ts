import { z } from 'zod';

const lineItemBase = z.object({
	// The line title (short name). Required.
	description: z.string().trim().min(1, 'Title is required').max(500),
	// Optional longer description shown under the title. Display-only.
	details: z.string().trim().max(2000).nullable().optional(),
	quantity: z.coerce.number().positive('Quantity must be positive').max(999999),
	unit: z.string().trim().max(50).nullable().optional(),
	// Optional grouping heading. Display/organization only — never affects totals.
	section_label: z.string().trim().max(100).nullable().optional(),
	// Optional add-on line the customer can choose before accepting. Excluded from the
	// quote's base total. Defaults false (a normal required line) when omitted.
	is_optional: z.boolean().optional(),
	// Per-line sales-tax flag. Only taxable lines feed the quote's tax base. Defaults true
	// (taxable) when omitted, preserving the old quote-wide behavior.
	taxable: z.boolean().optional(),
	// Stable per-line identity (see quote_line_items.line_key). Carried through so per-line
	// photos stay bound across the save's wipe-and-reinsert. Omitted → DB defaults a fresh one.
	line_key: z.string().uuid().nullable().optional(),
	// Good-Better-Best: the package (tier) this line belongs to, referenced by the package's
	// stable package_key (NOT its db id, which is regenerated on every save). Required on a
	// tiered quote, must be absent on a simple quote — cross-validated in validatePackages.
	package_key: z.string().uuid().nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Unit price cannot be negative').max(9999999.99),
	// Snapshot of cost-to-business captured when added from catalog. Display-never for now.
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	// Analytics-only soft link back to the catalog item this line came from.
	source_catalog_item_id: z.string().uuid().nullable().optional(),
	position: z.coerce.number().int().min(0).optional()
});

// Good-Better-Best package (tier). package_key is the stable client identity that lines
// reference; omitted → the DB defaults a fresh one and the route echoes it back on read.
const quotePackageSchema = z.object({
	package_key: z.string().uuid().nullable().optional(),
	name: z.string().trim().min(1, 'Package name is required').max(60),
	is_recommended: z.boolean().optional(),
	position: z.coerce.number().int().min(0).optional()
});

// Shared package validation for create + update. A quote is either SIMPLE (no packages; no
// line may carry a package_key) or TIERED (2–3 packages, exactly one recommended, every line
// references an existing package). When `packages` is provided, `line_items` must be too —
// they are saved as one unit. Errors are attached to `packages` / `line_items` so the UI can
// surface them near the builder.
function validatePackages(
	val: {
		packages?: { package_key?: string | null; is_recommended?: boolean }[];
		line_items?: { package_key?: string | null }[];
	},
	ctx: z.RefinementCtx
): void {
	const packages = val.packages;
	if (packages === undefined) {
		// Packages untouched. If lines are being saved, none may reference a package (a simple
		// quote's lines must be package-free; a tiered edit always resends packages).
		if (val.line_items?.some((li) => li.package_key)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['line_items'],
				message: 'Line items reference a package but no packages were sent'
			});
		}
		return;
	}

	// Whenever packages are sent, the line items must be sent alongside them.
	if (val.line_items === undefined) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['line_items'],
			message: 'Line items are required when packages are set'
		});
		return;
	}

	// Empty array = convert to / stay SIMPLE. No line may carry a package_key.
	if (packages.length === 0) {
		if (val.line_items.some((li) => li.package_key)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['line_items'],
				message: 'Remove package assignments before switching to a single-option quote'
			});
		}
		return;
	}

	// TIERED — 2 or 3 packages.
	if (packages.length < 2 || packages.length > 3) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['packages'],
			message: 'A tiered quote must have 2 or 3 packages'
		});
	}

	// Exactly one recommended tier.
	const recommendedCount = packages.filter((p) => p.is_recommended).length;
	if (recommendedCount !== 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['packages'],
			message: 'Mark exactly one package as recommended'
		});
	}

	// package_keys must be present and unique so lines can resolve to a single package.
	const keys = packages.map((p) => p.package_key).filter((k): k is string => typeof k === 'string');
	if (keys.length !== packages.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['packages'],
			message: 'Each package needs an identity'
		});
	}
	const keySet = new Set(keys);
	if (keySet.size !== keys.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['packages'],
			message: 'Duplicate package identity'
		});
	}

	// Every line must belong to one of these packages, and every package must hold at least
	// one line (no empty $0 tier).
	const usedKeys = new Set<string>();
	for (const li of val.line_items) {
		if (!li.package_key || !keySet.has(li.package_key)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['line_items'],
				message: 'Every line item must be assigned to a package'
			});
			break;
		}
		usedKeys.add(li.package_key);
	}
	if (val.line_items.length > 0 && usedKeys.size < keySet.size) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['packages'],
			message: 'Each package must contain at least one line item'
		});
	}
}

// Shared discount validation for create + update. A fixed discount needs a positive dollar
// amount; a percent discount needs a value in (0, 100]. (The server clamps a fixed discount
// to the subtotal, so we only guard the lower bound here.) 'none'/omitted = no discount.
function validateDiscount(
	val: { discount_type?: 'none' | 'fixed' | 'percent'; discount_value?: number | null },
	ctx: z.RefinementCtx
): void {
	if (!val.discount_type || val.discount_type === 'none') return;
	const v = val.discount_value;
	if (v === null || v === undefined || v <= 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discount_value'],
			message:
				val.discount_type === 'percent'
					? 'Enter a percentage greater than 0'
					: 'Enter a discount amount greater than 0'
		});
		return;
	}
	if (val.discount_type === 'percent' && v > 100) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discount_value'],
			message: 'Percentage cannot exceed 100'
		});
	}
}

export const createQuoteSchema = z
	.object({
		contact_id: z.string().uuid('Contact is required'),
		opportunity_id: z.string().uuid().nullable().optional(),
		// Job site for this quote — must be one of the contact's saved addresses (validated
		// against the contact in the route). Null = no specific service address.
		service_address_id: z.string().uuid().nullable().optional(),
		title: z.string().trim().min(1, 'Title is required').max(200),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		expires_at: z.coerce.date().nullable().optional(),
		deposit_required: z.boolean().optional(),
		deposit_type: z.enum(['fixed', 'percent']).optional(),
		deposit_amount: z.coerce.number().min(0).nullable().optional(),
		deposit_percent: z.coerce.number().min(0.01).max(99.99).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		internal_notes: z.string().trim().max(5000).nullable().optional(),
		// Customer-facing Terms & Conditions for this quote. On create, omitted → server
		// snapshots the org default; on update, an explicit value overrides. Null clears it.
		terms: z.string().trim().max(8000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional(),
		// Good-Better-Best tiers. Omitted/absent = simple quote. See validatePackages.
		packages: z.array(quotePackageSchema).max(3).optional()
	})
	.superRefine((val, ctx) => {
		validateDiscount(val, ctx);
		validatePackages(val, ctx);
		if (!val.deposit_required) return;
		if ((val.deposit_type ?? 'fixed') === 'percent') {
			if (!val.deposit_percent || val.deposit_percent <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_percent'],
					message: 'Enter a percentage between 0.01 and 99.99'
				});
			}
		} else {
			if (
				val.deposit_amount === null ||
				val.deposit_amount === undefined ||
				val.deposit_amount <= 0
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_amount'],
					message: 'Deposit amount is required when deposit is enabled'
				});
			}
		}
	});

export const updateQuoteSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		// Job site — must be one of the contact's saved addresses (validated in the route).
		service_address_id: z.string().uuid().nullable().optional(),
		tax_rate: z.coerce.number().min(0).max(1).optional(),
		discount_type: z.enum(['none', 'fixed', 'percent']).optional(),
		discount_value: z.coerce.number().min(0).max(9999999.99).nullable().optional(),
		discount_label: z.string().trim().max(60).nullable().optional(),
		expires_at: z.coerce.date().nullable().optional(),
		deposit_required: z.boolean().optional(),
		deposit_type: z.enum(['fixed', 'percent']).optional(),
		deposit_amount: z.coerce.number().min(0).nullable().optional(),
		deposit_percent: z.coerce.number().min(0.01).max(99.99).nullable().optional(),
		notes: z.string().trim().max(5000).nullable().optional(),
		internal_notes: z.string().trim().max(5000).nullable().optional(),
		// Customer-facing Terms & Conditions for this quote. On create, omitted → server
		// snapshots the org default; on update, an explicit value overrides. Null clears it.
		terms: z.string().trim().max(8000).nullable().optional(),
		line_items: z.array(lineItemBase).max(200).optional(),
		// Good-Better-Best tiers. Omitted = leave packages untouched; [] = convert to simple;
		// 2–3 = tiered. See validatePackages.
		packages: z.array(quotePackageSchema).max(3).optional()
	})
	.superRefine((val, ctx) => {
		validateDiscount(val, ctx);
		validatePackages(val, ctx);
		if (val.deposit_required !== true) return;
		if ((val.deposit_type ?? 'fixed') === 'percent') {
			if (!val.deposit_percent || val.deposit_percent <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_percent'],
					message: 'Enter a percentage between 0.01 and 99.99'
				});
			}
		} else {
			if (
				val.deposit_amount === null ||
				val.deposit_amount === undefined ||
				val.deposit_amount <= 0
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['deposit_amount'],
					message: 'Deposit amount is required when deposit is enabled'
				});
			}
		}
	});

// Send / resend a quote. The contractor picks the delivery channel(s) and may
// override the default message copy. Bodies carry merge tokens ({contact_name},
// {org_name}, {quote_number}, {quote_amount}, {quote_link}) that the worker
// interpolates at delivery time. Null/omitted body = use the built-in default.
// Channel availability (email present, not SMS-opted-out) is enforced in the route.
export const sendQuoteSchema = z.object({
	channels: z
		.array(z.enum(['email', 'sms']))
		.min(1, 'Choose at least one channel')
		.max(2)
		.transform((arr) => Array.from(new Set(arr))),
	sms_body: z.string().trim().max(640).nullable().optional(),
	email_subject: z.string().trim().max(200).nullable().optional(),
	email_body: z.string().trim().max(5000).nullable().optional(),
	// Resend only: set true when the re-send follows an edit of an already-sent/viewed quote,
	// so the route freezes a new version snapshot (Sent v(N+1)) and resets view tracking. A
	// plain re-delivery of unchanged content omits it and keeps the same version. Ignored by /send.
	revision: z.boolean().optional()
});

export type SendQuoteInput = z.infer<typeof sendQuoteSchema>;

export const createLineItemSchema = lineItemBase;
export const updateLineItemSchema = lineItemBase.partial();

export const listQuotesQuerySchema = z.object({
	status: z
		.enum(['all', 'active', 'closed', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'])
		.default('all'),
	cursor: z.string().nullable().optional()
});

export const createTemplateSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	description: z.string().trim().max(1000).nullable().optional(),
	line_items: z.array(lineItemBase).max(200).optional()
});

export const updateTemplateSchema = z.object({
	name: z.string().trim().min(1).max(200).optional(),
	description: z.string().trim().max(1000).nullable().optional(),
	line_items: z.array(lineItemBase).max(200).optional()
});

// ── Product / Service Catalog ──────────────────────────────────────────────
const catalogItemBase = {
	name: z.string().trim().min(1, 'Name is required').max(200),
	description: z.string().trim().max(1000).nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Price cannot be negative').max(9999999.99),
	unit: z.string().trim().max(50).nullable().optional(),
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	// Default per-line tax flag when this item is added to a quote/invoice line. Defaults
	// true (taxable) when omitted.
	default_taxable: z.boolean().optional(),
	category: z.string().trim().max(100).nullable().optional(),
	image_url: z.string().max(500).nullable().optional()
};

export const createCatalogItemSchema = z.object({
	...catalogItemBase,
	// When false/absent the API rejects a name that already exists (409) so the UI can
	// offer "update existing vs save as new". Set true to deliberately create a duplicate.
	force: z.boolean().optional()
});

export const updateCatalogItemSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200).optional(),
	description: z.string().trim().max(1000).nullable().optional(),
	unit_price: z.coerce.number().min(0, 'Price cannot be negative').max(9999999.99).optional(),
	unit: z.string().trim().max(50).nullable().optional(),
	unit_cost: z.coerce
		.number()
		.min(0, 'Cost cannot be negative')
		.max(9999999.99)
		.nullable()
		.optional(),
	default_taxable: z.boolean().optional(),
	category: z.string().trim().max(100).nullable().optional(),
	image_url: z.string().max(500).nullable().optional()
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type CreateLineItemInput = z.infer<typeof createLineItemSchema>;
export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
