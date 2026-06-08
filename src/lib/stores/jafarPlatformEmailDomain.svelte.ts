// Client store for the /jafar dashboard "Platform email domain" panel. Holds the
// PO-managed platform system sending domain state and wraps create/verify/delete.
// Singleton (no org id) — the outbound-only mirror of jafarEmailDomain.svelte.
// PO-operated only; never reachable from contractor routes.

import type { EmailDnsRecord } from './jafarEmailDomain.svelte';

export type { EmailDnsRecord };

export type PlatformEmailState = {
	domain: string | null;
	root_domain: string | null;
	sending_prefix: string | null;
	from_local: string;
	from_name: string;
	from_address: string | null;
	status: 'pending' | 'verifying' | 'verified' | 'failed' | null;
	brevo_verified: boolean;
	brevo_authenticated: boolean;
	dns_records: EmailDnsRecord[] | null;
	last_checked_at: string | null;
	verified_at: string | null;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';
type MutationResult = { ok: boolean; error?: string };

const BASE = '/api/admin/platform/email-domain';

let state = $state<PlatformEmailState | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);

// Pull the error/field_error message out of the fixed API error shape.
async function errMessage(res: Response, fallback: string): Promise<string> {
	const body = (await res.json().catch(() => ({}))) as {
		error?: string;
		field_errors?: Record<string, string>;
	};
	const fieldMsg = body.field_errors ? Object.values(body.field_errors)[0] : undefined;
	return body.error ?? fieldMsg ?? fallback;
}

async function load(): Promise<void> {
	status = state ? 'ready' : 'loading';
	error = null;
	try {
		const res = await fetch(BASE);
		if (!res.ok) {
			if (res.status === 401) throw new Error('UNAUTHORIZED');
			throw new Error('Failed to load platform email domain.');
		}
		const body = (await res.json()) as { data: PlatformEmailState };
		state = body.data;
		status = 'ready';
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to load platform email domain.';
		status = 'error';
	}
}

export type CreateInput = {
	root_domain: string;
	sending_prefix: string;
	from_local: string;
	from_name: string;
};

async function create(input: CreateInput): Promise<MutationResult> {
	try {
		const res = await fetch(BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input)
		});
		if (!res.ok)
			return { ok: false, error: await errMessage(res, 'Could not register the domain.') };
		const body = (await res.json()) as { data: PlatformEmailState };
		state = body.data;
		status = 'ready';
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error. Try again.' };
	}
}

async function verify(): Promise<MutationResult> {
	try {
		const res = await fetch(`${BASE}/verify`, { method: 'POST' });
		if (!res.ok) return { ok: false, error: await errMessage(res, 'Verification failed.') };
		const body = (await res.json()) as { data: PlatformEmailState };
		state = body.data;
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error. Try again.' };
	}
}

async function remove(): Promise<MutationResult> {
	try {
		const res = await fetch(BASE, { method: 'DELETE' });
		if (!res.ok && res.status !== 204)
			return { ok: false, error: await errMessage(res, 'Could not remove the domain.') };
		state = await refreshAfterRemove();
		status = 'ready';
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error. Try again.' };
	}
}

// DELETE returns 204; re-read the cleared singleton so the panel shows the form.
async function refreshAfterRemove(): Promise<PlatformEmailState | null> {
	try {
		const res = await fetch(BASE);
		if (!res.ok) return null;
		const body = (await res.json()) as { data: PlatformEmailState };
		return body.data;
	} catch {
		return null;
	}
}

export const jafarPlatformEmailDomainStore = {
	get state() {
		return state;
	},
	get status() {
		return status;
	},
	get error() {
		return error;
	},
	load,
	create,
	verify,
	remove
};
