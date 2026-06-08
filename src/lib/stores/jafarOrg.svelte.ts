import type { PlanName } from '$lib/admin/planTemplates';
import type { FeatureFlags, OrgLimits } from '$lib/types';

export type Org = {
	id: string;
	name: string;
	slug: string;
	status: 'active' | 'suspended' | 'pending_deletion' | 'deleted' | 'pending_setup';
	trade_type: string;
	country: string | null;
	address: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	timezone: string;
	logo_url: string | null;
	primary_color: string | null;
	twilio_phone_number: string | null;
	twilio_subaccount_sid: string | null;
	// Stripe connection (written by /api/settings/stripe into dedicated columns, NOT
	// into integration_status). Populated once the org connects a Stripe account.
	stripe_account_id: string | null;
	stripe_account_name: string | null;
	stripe_account_email: string | null;
	stripe_livemode: boolean | null;
	stripe_connected_at: string | null;
	stripe_last_verified_at: string | null;
	is_setup_complete: boolean;
	sms_enabled: boolean;
	sms_approval_status: 'not_required' | 'pending' | 'approved' | 'rejected';
	sms_approval_submitted_at: string | null;
	sms_approval_reason: string | null;
	// Carrier registration (Onboarding.md Step 4) — collected in onboarding, copied
	// by the PO for manual Twilio submission. All nullable; address is reused above.
	legal_business_name: string | null;
	ein: string | null;
	business_number: string | null;
	website: string | null;
	messaging_use_case: string | null;
	calendar_day_start_hour: number;
	calendar_day_end_hour: number;
	created_at: string;
	updated_at: string;
	plan: PlanName;
	integration_status: Record<string, unknown>;
	feature_overrides_updated_at: string | null;
	widget_token: string;
} & FeatureFlags &
	OrgLimits;

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type Cached = { org: Org; fetchedAt: number };

const TTL_MS = 30_000;
const TIMEOUT_MS = 10_000;

// Per-id cache (plain object, NOT reactive — only the active slot drives the UI).
const cache = new Map<string, Cached>();

// Reactive slot for the currently viewed org.
let currentId = $state<string | null>(null);
let org = $state<Org | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let activeController: AbortController | null = null;

async function fetchOnce(id: string, signal: AbortSignal): Promise<Org> {
	const res = await fetch(`/api/admin/orgs/${id}`, { signal });
	if (!res.ok) {
		if (res.status === 401) throw new Error('UNAUTHORIZED');
		if (res.status === 404) throw new Error('Organization not found.');
		throw new Error('Failed to load organization.');
	}
	const body = (await res.json()) as { org: Org };
	return body.org;
}

async function run(id: string, force: boolean): Promise<void> {
	// Switching id: drop previous reactive state, hydrate from cache if we have it.
	if (currentId !== id) {
		currentId = id;
		const cached = cache.get(id);
		org = cached?.org ?? null;
		status = cached ? 'ready' : 'loading';
		error = null;
	}

	const cached = cache.get(id);
	const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;
	if (fresh && !force) {
		status = 'ready';
		error = null;
		return;
	}

	if (activeController) activeController.abort();
	const controller = new AbortController();
	activeController = controller;

	status = cached ? 'revalidating' : 'loading';
	error = null;

	const timeout = setTimeout(() => {
		if (activeController === controller) {
			controller.abort();
			if (!cached) {
				status = 'error';
				error = 'Request timed out. Tap retry.';
			} else {
				status = 'ready';
				error = 'Background refresh timed out.';
			}
		}
	}, TIMEOUT_MS);

	try {
		const fetched = await fetchOnce(id, controller.signal);
		if (currentId !== id) return; // user navigated away
		cache.set(id, { org: fetched, fetchedAt: Date.now() });
		org = fetched;
		status = 'ready';
		error = null;
	} catch (e) {
		if ((e as { name?: string })?.name === 'AbortError') return;
		if (currentId !== id) return;
		const msg = e instanceof Error ? e.message : 'Failed to load organization.';
		error = msg;
		status = cached ? 'ready' : 'error';
	} finally {
		clearTimeout(timeout);
		if (activeController === controller) activeController = null;
	}
}

export const jafarOrgStore = {
	get currentId() {
		return currentId;
	},
	get org() {
		return org;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},

	async load(id: string): Promise<void> {
		await run(id, false);
	},

	async refresh(id: string): Promise<void> {
		await run(id, true);
	}
};
