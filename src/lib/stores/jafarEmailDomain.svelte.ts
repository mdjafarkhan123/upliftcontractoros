// Client store for the /jafar org-detail "Email Domain" panel. Holds the current
// org's email_domains row + the inbound webhook path, and wraps the create/verify/
// delete mutations. PO-operated only — never reachable from contractor routes.

export type EmailDnsRecord = {
	type: 'TXT' | 'MX' | 'CNAME';
	host: string;
	value: string;
	priority?: number;
	purpose: 'dkim' | 'brevo_code' | 'dmarc' | 'inbound_mx';
	label: string;
	scope?: 'sending' | 'receiving';
	status?: boolean;
};

export type EmailDomainRow = {
	id: string;
	org_id: string;
	root_domain: string;
	sending_prefix: string;
	inbound_prefix: string;
	domain: string;
	inbound_domain: string;
	brevo_domain_id: string | null;
	inbound_webhook_token: string;
	status: 'pending' | 'verifying' | 'verified' | 'failed';
	brevo_verified: boolean;
	brevo_authenticated: boolean;
	dns_records: EmailDnsRecord[] | null;
	last_checked_at: string | null;
	verified_at: string | null;
	created_at: string;
	updated_at: string;
};

type GetPayload = { domain: EmailDomainRow | null; inbound_webhook_path: string | null };
type Status = 'idle' | 'loading' | 'ready' | 'error';
type MutationResult = { ok: boolean; error?: string };

let currentId = $state<string | null>(null);
let row = $state<EmailDomainRow | null>(null);
let inboundPath = $state<string | null>(null);
let status = $state<Status>('idle');
let error = $state<string | null>(null);

async function fetchJson(id: string): Promise<GetPayload> {
	const res = await fetch(`/api/admin/orgs/${id}/email-domain`);
	if (!res.ok) {
		if (res.status === 401) throw new Error('UNAUTHORIZED');
		throw new Error('Failed to load email domain.');
	}
	const body = (await res.json()) as { data: GetPayload };
	return body.data;
}

async function load(id: string): Promise<void> {
	if (currentId !== id) {
		currentId = id;
		row = null;
		inboundPath = null;
	}
	status = row ? 'ready' : 'loading';
	error = null;
	try {
		const data = await fetchJson(id);
		if (currentId !== id) return;
		row = data.domain;
		inboundPath = data.inbound_webhook_path;
		status = 'ready';
	} catch (e) {
		if (currentId !== id) return;
		error = e instanceof Error ? e.message : 'Failed to load email domain.';
		status = 'error';
	}
}

// Pull the error/field_error message out of the fixed API error shape.
async function errMessage(res: Response, fallback: string): Promise<string> {
	const body = (await res.json().catch(() => ({}))) as {
		error?: string;
		field_errors?: Record<string, string>;
	};
	const fieldMsg = body.field_errors ? Object.values(body.field_errors)[0] : undefined;
	return body.error ?? fieldMsg ?? fallback;
}

type CreateInput = {
	root_domain: string;
	sending_prefix: string;
	inbound_prefix: string;
};

async function create(id: string, input: CreateInput): Promise<MutationResult> {
	try {
		const res = await fetch(`/api/admin/orgs/${id}/email-domain`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(input)
		});
		if (!res.ok)
			return { ok: false, error: await errMessage(res, 'Could not register the domain.') };
		const body = (await res.json()) as { data: GetPayload };
		if (currentId === id) {
			row = body.data.domain;
			inboundPath = body.data.inbound_webhook_path;
			status = 'ready';
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error. Try again.' };
	}
}

async function verify(id: string): Promise<MutationResult> {
	try {
		const res = await fetch(`/api/admin/orgs/${id}/email-domain/verify`, { method: 'POST' });
		if (!res.ok) return { ok: false, error: await errMessage(res, 'Verification failed.') };
		const body = (await res.json()) as { data: { domain: EmailDomainRow } };
		if (currentId === id) row = body.data.domain;
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error. Try again.' };
	}
}

async function remove(id: string): Promise<MutationResult> {
	try {
		const res = await fetch(`/api/admin/orgs/${id}/email-domain`, { method: 'DELETE' });
		if (!res.ok && res.status !== 204)
			return { ok: false, error: await errMessage(res, 'Could not remove the domain.') };
		if (currentId === id) {
			row = null;
			inboundPath = null;
			status = 'ready';
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Network error. Try again.' };
	}
}

export const jafarEmailDomainStore = {
	get currentId() {
		return currentId;
	},
	get row() {
		return row;
	},
	get inboundPath() {
		return inboundPath;
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
