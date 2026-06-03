import type {
	DashboardActivityIcon,
	DashboardActivityRow,
	DashboardActivityTone
} from '$lib/types/dashboard';
import { createLogger } from '$lib/server/log';

const log = createLogger('dashboard.activity');

export type OutboxActivityRow = {
	id: string;
	event_type: string;
	resource_type: string;
	resource_id: string;
	payload: Record<string, unknown>;
	created_at: string | Date;
	contact_name: string | null;
};

/**
 * Registry contract — every supported event type MUST provide all fields.
 * Server is the sole authority on icon, tone, label, and route.
 * The client is render-only and never branches on event_type.
 */
export type RegistryEntry = {
	icon_key: DashboardActivityIcon;
	tone: DashboardActivityTone;
	is_renderable: (row: OutboxActivityRow) => boolean;
	build_label: (row: OutboxActivityRow) => string;
	build_target_route: (row: OutboxActivityRow) => string;
	// Forward-compat ranking weight. Not consumed by v1 sorting.
	// Defined here so future weighting/ranking can land without bumping
	// the serialized row shape or backfilling registry entries.
	priority?: number;
};

const who = (row: OutboxActivityRow): string => row.contact_name?.trim() || 'a customer';

const hasResourceId = (row: OutboxActivityRow): boolean => !!row.resource_id;

const REGISTRY: Record<string, RegistryEntry> = {
	'contact.created': {
		icon_key: 'lead',
		tone: 'positive',
		is_renderable: hasResourceId,
		build_label: (row) => `New lead: ${who(row)}`,
		build_target_route: (row) => `/contacts/${row.resource_id}`
	},
	'quote.sent': {
		icon_key: 'quote_sent',
		tone: 'neutral',
		is_renderable: hasResourceId,
		build_label: (row) => {
			const num =
				typeof row.payload?.quote_number_display === 'string'
					? row.payload.quote_number_display
					: null;
			return num ? `Quote ${num} sent to ${who(row)}` : `Quote sent to ${who(row)}`;
		},
		build_target_route: (row) => `/quotes/${row.resource_id}`
	},
	'opportunity.assignee_changed': {
		icon_key: 'opportunity_assignee_changed',
		tone: 'neutral',
		is_renderable: hasResourceId,
		build_label: (row) => {
			const title = typeof row.payload?.title === 'string' ? row.payload.title.trim() : '';
			return title ? `Reassigned: ${title}` : `Opportunity reassigned`;
		},
		build_target_route: (row) => `/pipeline/${row.resource_id}`
	},
	'quote.viewed': {
		icon_key: 'quote_viewed',
		tone: 'neutral',
		is_renderable: hasResourceId,
		build_label: (row) => `${who(row)} viewed a quote`,
		build_target_route: (row) => `/quotes/${row.resource_id}`
	},
	'quote.accepted': {
		icon_key: 'quote_accepted',
		tone: 'positive',
		is_renderable: hasResourceId,
		build_label: (row) => `${who(row)} accepted a quote`,
		build_target_route: (row) => `/quotes/${row.resource_id}`
	},
	'quote.declined': {
		icon_key: 'quote_declined',
		tone: 'negative',
		is_renderable: hasResourceId,
		build_label: (row) => `${who(row)} declined a quote`,
		build_target_route: (row) => `/quotes/${row.resource_id}`
	},
	'opportunity.created': {
		icon_key: 'opportunity_created',
		tone: 'positive',
		is_renderable: hasResourceId,
		build_label: (row) => {
			const title = typeof row.payload?.title === 'string' ? row.payload.title.trim() : '';
			return title ? `New opportunity: ${title}` : `New opportunity for ${who(row)}`;
		},
		build_target_route: (row) => `/pipeline/${row.resource_id}`
	},
	'opportunity.stage_changed': {
		icon_key: 'opportunity_stage_changed',
		tone: 'neutral',
		is_renderable: (row) => hasResourceId(row) && typeof row.payload?.to_stage_name === 'string',
		build_label: (row) => {
			const stage = String(row.payload.to_stage_name);
			return `${who(row)} moved to ${stage}`;
		},
		build_target_route: (row) => `/pipeline/${row.resource_id}`
	},
	'opportunity.won': {
		icon_key: 'opportunity_won',
		tone: 'positive',
		is_renderable: hasResourceId,
		build_label: (row) => `Won: ${who(row)}`,
		build_target_route: (row) => `/pipeline/${row.resource_id}`
	},
	'opportunity.lost': {
		icon_key: 'opportunity_lost',
		tone: 'negative',
		is_renderable: hasResourceId,
		build_label: (row) => {
			const reason =
				typeof row.payload?.lost_reason === 'string' && row.payload.lost_reason.trim()
					? ` (${row.payload.lost_reason})`
					: '';
			return `Lost: ${who(row)}${reason}`;
		},
		build_target_route: (row) => `/pipeline/${row.resource_id}`
	},
	'contact.status_changed': {
		icon_key: 'contact_became_customer',
		tone: 'positive',
		is_renderable: (row) => hasResourceId(row) && row.payload?.new_status === 'customer',
		build_label: (row) => `${who(row)} became a customer`,
		build_target_route: (row) => `/contacts/${row.resource_id}`
	},
	'job.completed': {
		icon_key: 'job_completed',
		tone: 'positive',
		is_renderable: hasResourceId,
		build_label: (row) => `Job completed for ${who(row)}`,
		build_target_route: (row) => `/jobs/${row.resource_id}`
	},
	'invoice.paid': {
		icon_key: 'payment',
		tone: 'positive',
		is_renderable: hasResourceId,
		build_label: (row) => `Invoice paid by ${who(row)}`,
		build_target_route: (row) => `/invoices/${row.resource_id}`
	},
	'payment.recorded': {
		icon_key: 'payment',
		tone: 'positive',
		is_renderable: (row) => typeof row.payload?.invoice_id === 'string',
		build_label: (row) => `Payment from ${who(row)}`,
		build_target_route: (row) => `/invoices/${row.payload.invoice_id as string}`
	},
	'review.received': {
		icon_key: 'review_received',
		tone: 'positive',
		is_renderable: () => true,
		build_label: (row) => `New review from ${who(row)}`,
		build_target_route: () => `/reputation`
	}
};

export const ACTIVITY_ALLOWLIST: string[] = Object.keys(REGISTRY);

export function buildActivityRow(row: OutboxActivityRow): DashboardActivityRow | null {
	const entry = REGISTRY[row.event_type];
	if (!entry) {
		log.warn({
			event_type: row.event_type,
			resource_id: row.resource_id,
			outbox_id: row.id,
			reason: 'unmapped_event_type'
		});
		return null;
	}
	if (!entry.is_renderable(row)) {
		log.warn({
			event_type: row.event_type,
			resource_id: row.resource_id,
			outbox_id: row.id,
			reason: 'is_renderable_returned_false',
			payload: row.payload
		});
		return null;
	}
	const occurredAt =
		row.created_at instanceof Date
			? row.created_at.toISOString()
			: new Date(row.created_at).toISOString();
	return {
		id: row.id,
		icon_key: entry.icon_key,
		tone: entry.tone,
		label: entry.build_label(row),
		target_route: entry.build_target_route(row),
		occurred_at: occurredAt,
		priority: entry.priority ?? 0
	};
}
