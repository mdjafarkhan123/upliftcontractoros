import { SvelteMap } from 'svelte/reactivity';

// ───── Types ───────────────────────────────────────────────────────────────

export type ConversationChannel = 'sms' | 'missed_call' | 'email' | 'webchat';
export type ConversationStatus = 'open' | 'closed' | 'archived';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus =
	| 'sending'
	| 'sent'
	| 'delivered'
	| 'failed'
	| 'received'
	| 'queued'
	| 'bounced';
export type MessageChannel = 'sms' | 'missed_call' | 'email' | 'webchat';

export type InboxFilter = 'all' | 'unread' | 'sms' | 'missed_calls';

export type ConversationListItem = {
	id: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_sms_opt_out: boolean;
	channel: ConversationChannel;
	status: ConversationStatus;
	assigned_to: string | null;
	assignee_name: string | null;
	last_message_at: string | null;
	unread_count: number;
	created_at: string;
	last_message_body: string | null;
	last_message_direction: MessageDirection | null;
};

export type ThreadMessage = {
	id: string;
	org_id: string;
	conversation_id: string;
	direction: MessageDirection;
	channel: MessageChannel;
	body: string | null;
	is_internal_note: boolean;
	media_urls: string[] | null;
	status: MessageStatus;
	twilio_message_sid: string | null;
	sent_by: string | null;
	sent_at: string | null;
	read_at: string | null;
	created_at: string;
	updated_at: string;
	// Local-only flag for optimistic messages that haven't been confirmed
	_optimistic_key?: string;
};

export type ConversationDetail = {
	id: string;
	org_id: string;
	contact_id: string;
	channel: ConversationChannel;
	status: ConversationStatus;
	assigned_to: string | null;
	assignee_name: string | null;
	last_message_at: string | null;
	unread_count: number;
	created_at: string;
	updated_at: string;
};

export type ContactSummary = {
	id: string;
	full_name: string;
	phone: string;
	email: string | null;
	status: string;
	sms_opt_out: boolean;
};

export type ThreadContext = {
	pipeline_stage: string | null;
	latest_quote: { id: string; quote_number: number; status: string; total: string } | null;
	latest_invoice: { id: string; invoice_number: number; status: string; total: string } | null;
};

export type InboxFilters = {
	filter: InboxFilter;
	q: string;
};

type ListStatus = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';
type ThreadStatus = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

type ListEntry = {
	items: ConversationListItem[];
	nextCursor: string | null;
	fetchedAt: number;
};

type ThreadEntry = {
	conversation: ConversationDetail | null;
	contact: ContactSummary | null;
	context: ThreadContext | null;
	messages: ThreadMessage[];
	nextCursor: string | null;
	fetchedAt: number;
};

const LIST_TTL_MS = 30_000;
const THREAD_TTL_MS = 30_000;

// ───── List cache ──────────────────────────────────────────────────────────

const listCache = new SvelteMap<string, ListEntry>();
let currentListKey = $state('');
let listStatus = $state<ListStatus>('idle');
let listError = $state<string | null>(null);
let listController: AbortController | null = null;

function buildListKey(f: InboxFilters): string {
	return `${f.filter}|${f.q.trim()}`;
}

function buildListParams(f: InboxFilters, cursor: string | null): URLSearchParams {
	const p = new URLSearchParams();
	if (f.filter !== 'all') p.set('filter', f.filter);
	if (f.q.trim()) p.set('q', f.q.trim());
	if (cursor) p.set('cursor', cursor);
	return p;
}

async function fetchList(
	f: InboxFilters,
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: ConversationListItem[]; next_cursor: string | null }> {
	const res = await fetch(`/api/conversations?${buildListParams(f, cursor)}`, { signal });
	if (!res.ok) throw new Error('Failed to load conversations');
	const body = (await res.json()) as { data: { items: ConversationListItem[]; next_cursor: string | null } };
	return body.data;
}

// ───── Thread cache ────────────────────────────────────────────────────────

const threadCache = new SvelteMap<string, ThreadEntry>();
const threadStatusMap = new SvelteMap<string, ThreadStatus>();
const threadErrorMap = new SvelteMap<string, string | null>();
const threadControllers = new Map<string, AbortController>();

async function fetchThreadDetail(
	id: string,
	signal: AbortSignal
): Promise<{ conversation: ConversationDetail; contact: ContactSummary; context: ThreadContext }> {
	const res = await fetch(`/api/conversations/${id}`, { signal });
	if (!res.ok) throw new Error('Failed to load conversation');
	const body = (await res.json()) as { data: { conversation: ConversationDetail; contact: ContactSummary; context: ThreadContext } };
	return body.data;
}

async function fetchThreadMessages(
	id: string,
	cursor: string | null,
	signal: AbortSignal
): Promise<{ items: ThreadMessage[]; next_cursor: string | null }> {
	const url = cursor
		? `/api/conversations/${id}/messages?cursor=${encodeURIComponent(cursor)}`
		: `/api/conversations/${id}/messages`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error('Failed to load messages');
	const body = (await res.json()) as { data: { items: ThreadMessage[]; next_cursor: string | null } };
	return body.data;
}

// ───── Reconcilers (shared between mutations and Realtime) ────────────────

function patchListEntriesForMessage(
	conversationId: string,
	mutate: (item: ConversationListItem) => ConversationListItem
): void {
	for (const [k, entry] of listCache) {
		const idx = entry.items.findIndex((c) => c.id === conversationId);
		if (idx < 0) continue;
		const next = entry.items.slice();
		next[idx] = mutate(next[idx]);
		// Re-sort by last_message_at desc — the patched conversation likely moved up
		next.sort((a, b) => {
			const at = a.last_message_at ?? '';
			const bt = b.last_message_at ?? '';
			if (at === bt) return a.id < b.id ? 1 : -1;
			return at < bt ? 1 : -1;
		});
		listCache.set(k, { ...entry, items: next });
	}
}

function applyMessageToThread(conversationId: string, msg: ThreadMessage): void {
	const entry = threadCache.get(conversationId);
	if (!entry) return;

	// Dedupe: same id, OR same twilio_message_sid, OR optimistic placeholder
	// matching this id/sid (replace it in-place)
	let replaced = false;
	const messages = entry.messages.map((m) => {
		if (m.id === msg.id) {
			replaced = true;
			return msg;
		}
		if (
			msg.twilio_message_sid &&
			m.twilio_message_sid &&
			m.twilio_message_sid === msg.twilio_message_sid
		) {
			replaced = true;
			return msg;
		}
		return m;
	});

	if (!replaced) messages.push(msg);

	// Keep chronological order (oldest first)
	messages.sort((a, b) => {
		if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1;
		return a.created_at < b.created_at ? -1 : 1;
	});

	threadCache.set(conversationId, { ...entry, messages });
}

function applyConversationPatch(
	conversationId: string,
	patch: Partial<ConversationDetail>
): void {
	const entry = threadCache.get(conversationId);
	if (entry?.conversation) {
		threadCache.set(conversationId, {
			...entry,
			conversation: { ...entry.conversation, ...patch }
		});
	}

	for (const [k, le] of listCache) {
		const idx = le.items.findIndex((c) => c.id === conversationId);
		if (idx < 0) continue;
		const next = le.items.slice();
		next[idx] = { ...next[idx], ...(patch as Partial<ConversationListItem>) };
		listCache.set(k, { ...le, items: next });
	}
}

// ───── Public store API ────────────────────────────────────────────────────

export const inboxStore = {
	// ── List ─────────────────────────────────────────────────────────────
	get items(): ConversationListItem[] {
		return listCache.get(currentListKey)?.items ?? [];
	},
	get nextCursor(): string | null {
		return listCache.get(currentListKey)?.nextCursor ?? null;
	},
	get listStatus(): ListStatus {
		return listStatus;
	},
	get listError(): string | null {
		return listError;
	},

	async loadList(filters: InboxFilters, force = false): Promise<void> {
		const key = buildListKey(filters);
		currentListKey = key;
		const cached = listCache.get(key);
		const fresh = cached && Date.now() - cached.fetchedAt < LIST_TTL_MS;
		if (fresh && !force) {
			listStatus = 'ready';
			listError = null;
			return;
		}
		if (listController) listController.abort();
		const controller = new AbortController();
		listController = controller;
		listStatus = cached ? 'revalidating' : 'loading';
		listError = null;
		try {
			const body = await fetchList(filters, null, controller.signal);
			listCache.set(key, {
				items: body.items,
				nextCursor: body.next_cursor,
				fetchedAt: Date.now()
			});
			listStatus = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			listError = e instanceof Error ? e.message : 'Failed to load conversations';
			listStatus = cached ? 'ready' : 'error';
		} finally {
			if (listController === controller) listController = null;
		}
	},

	async loadMoreList(filters: InboxFilters): Promise<void> {
		const key = buildListKey(filters);
		const cached = listCache.get(key);
		if (!cached?.nextCursor) return;
		const controller = new AbortController();
		try {
			const body = await fetchList(filters, cached.nextCursor, controller.signal);
			listCache.set(key, {
				items: [...cached.items, ...body.items],
				nextCursor: body.next_cursor,
				fetchedAt: Date.now()
			});
		} catch {
			// swallow — user can retry
		}
	},

	// ── Thread ───────────────────────────────────────────────────────────
	getThread(conversationId: string): ThreadEntry | undefined {
		return threadCache.get(conversationId);
	},
	threadStatus(conversationId: string): ThreadStatus {
		return threadStatusMap.get(conversationId) ?? 'idle';
	},
	threadError(conversationId: string): string | null {
		return threadErrorMap.get(conversationId) ?? null;
	},

	async loadThread(conversationId: string, force = false): Promise<void> {
		const cached = threadCache.get(conversationId);
		const fresh = cached && Date.now() - cached.fetchedAt < THREAD_TTL_MS;
		if (fresh && !force) {
			threadStatusMap.set(conversationId, 'ready');
			threadErrorMap.set(conversationId, null);
			return;
		}
		const prev = threadControllers.get(conversationId);
		if (prev) prev.abort();
		const controller = new AbortController();
		threadControllers.set(conversationId, controller);
		threadStatusMap.set(conversationId, cached ? 'revalidating' : 'loading');
		threadErrorMap.set(conversationId, null);

		try {
			const [detail, msgs] = await Promise.all([
				fetchThreadDetail(conversationId, controller.signal),
				fetchThreadMessages(conversationId, null, controller.signal)
			]);
			// Preserve optimistic messages that haven't been confirmed by the server yet
			const existingOptimistic = (cached?.messages ?? []).filter((m) => m._optimistic_key);
			const merged = [...msgs.items];
			for (const opt of existingOptimistic) {
				const confirmed = merged.find(
					(m) =>
						(opt.twilio_message_sid && m.twilio_message_sid === opt.twilio_message_sid) ||
						m.id === opt.id
				);
				if (!confirmed) merged.push(opt);
			}
			merged.sort((a, b) => {
				if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1;
				return a.created_at < b.created_at ? -1 : 1;
			});

			threadCache.set(conversationId, {
				conversation: detail.conversation,
				contact: detail.contact,
				context: detail.context,
				messages: merged,
				nextCursor: msgs.next_cursor,
				fetchedAt: Date.now()
			});
			threadStatusMap.set(conversationId, 'ready');
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			threadErrorMap.set(conversationId, e instanceof Error ? e.message : 'Failed to load thread');
			threadStatusMap.set(conversationId, cached ? 'ready' : 'error');
		} finally {
			if (threadControllers.get(conversationId) === controller) {
				threadControllers.delete(conversationId);
			}
		}
	},

	async loadMoreThreadMessages(conversationId: string): Promise<void> {
		const cached = threadCache.get(conversationId);
		if (!cached?.nextCursor) return;
		const controller = new AbortController();
		try {
			const body = await fetchThreadMessages(conversationId, cached.nextCursor, controller.signal);
			threadCache.set(conversationId, {
				...cached,
				messages: [...body.items, ...cached.messages],
				nextCursor: body.next_cursor
			});
		} catch {
			// swallow
		}
	},

	// ── Mutations ────────────────────────────────────────────────────────
	async sendMessage(
		conversationId: string,
		body: string,
		opts: { isInternalNote?: boolean } = {}
	): Promise<{ ok: true; message: ThreadMessage } | { ok: false; error: string }> {
		const isInternal = opts.isInternalNote === true;
		const entry = threadCache.get(conversationId);
		const optimisticKey = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const nowIso = new Date().toISOString();

		const optimistic: ThreadMessage = {
			id: optimisticKey,
			org_id: entry?.conversation?.org_id ?? '',
			conversation_id: conversationId,
			direction: 'outbound',
			channel: 'sms',
			body,
			is_internal_note: isInternal,
			media_urls: null,
			status: 'sending',
			twilio_message_sid: null,
			sent_by: null,
			sent_at: null,
			read_at: null,
			created_at: nowIso,
			updated_at: nowIso,
			_optimistic_key: optimisticKey
		};

		if (entry) {
			threadCache.set(conversationId, {
				...entry,
				messages: [...entry.messages, optimistic]
			});
		}

		try {
			const res = await fetch(`/api/conversations/${conversationId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ body, is_internal_note: isInternal })
			});
			const json = (await res.json().catch(() => ({}))) as {
				data?: { message: ThreadMessage };
				error?: string;
			};
			if (!res.ok || !json.data) {
				// Remove optimistic on failure
				const cur = threadCache.get(conversationId);
				if (cur) {
					threadCache.set(conversationId, {
						...cur,
						messages: cur.messages.filter((m) => m._optimistic_key !== optimisticKey)
					});
				}
				return { ok: false, error: json.error ?? 'Failed to send message' };
			}
			// Replace optimistic in place with confirmed
			const cur = threadCache.get(conversationId);
			if (cur) {
				const messages = cur.messages.map((m) =>
					m._optimistic_key === optimisticKey ? json.data!.message : m
				);
				threadCache.set(conversationId, { ...cur, messages });
			}
			// Bump conversation last_message_at + previews in list cache
			if (!isInternal) {
				patchListEntriesForMessage(conversationId, (c) => ({
					...c,
					last_message_at: json.data!.message.created_at,
					last_message_body: json.data!.message.body,
					last_message_direction: 'outbound'
				}));
				applyConversationPatch(conversationId, {
					last_message_at: json.data!.message.created_at
				});
			}
			return { ok: true, message: json.data.message };
		} catch (e) {
			const cur = threadCache.get(conversationId);
			if (cur) {
				threadCache.set(conversationId, {
					...cur,
					messages: cur.messages.filter((m) => m._optimistic_key !== optimisticKey)
				});
			}
			return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
		}
	},

	async markRead(conversationId: string): Promise<void> {
		// Optimistic local zeroing
		applyConversationPatch(conversationId, { unread_count: 0 });
		patchListEntriesForMessage(conversationId, (c) => ({ ...c, unread_count: 0 }));
		try {
			await fetch(`/api/conversations/${conversationId}/read`, { method: 'PATCH' });
		} catch {
			// silent — next load will sync correct value
		}
	},

	async setStatus(
		conversationId: string,
		status: ConversationStatus
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const before = threadCache.get(conversationId)?.conversation?.status;
		applyConversationPatch(conversationId, { status });
		try {
			const res = await fetch(`/api/conversations/${conversationId}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!res.ok) {
				if (before) applyConversationPatch(conversationId, { status: before });
				const json = (await res.json().catch(() => ({}))) as { error?: string };
				return { ok: false, error: json.error ?? 'Failed to update status' };
			}
			return { ok: true };
		} catch (e) {
			if (before) applyConversationPatch(conversationId, { status: before });
			return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
		}
	},

	async setAssignee(
		conversationId: string,
		assignedTo: string | null,
		assigneeName: string | null
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const beforeId = threadCache.get(conversationId)?.conversation?.assigned_to ?? null;
		const beforeName = threadCache.get(conversationId)?.conversation?.assignee_name ?? null;
		applyConversationPatch(conversationId, {
			assigned_to: assignedTo,
			assignee_name: assigneeName
		});
		try {
			const res = await fetch(`/api/conversations/${conversationId}/assign`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ assigned_to: assignedTo })
			});
			if (!res.ok) {
				applyConversationPatch(conversationId, {
					assigned_to: beforeId,
					assignee_name: beforeName
				});
				const json = (await res.json().catch(() => ({}))) as { error?: string };
				return { ok: false, error: json.error ?? 'Failed to assign' };
			}
			return { ok: true };
		} catch (e) {
			applyConversationPatch(conversationId, {
				assigned_to: beforeId,
				assignee_name: beforeName
			});
			return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
		}
	},

	// ── Realtime reconciliation ──────────────────────────────────────────
	applyRealtimeMessageInsert(msg: ThreadMessage): void {
		applyMessageToThread(msg.conversation_id, msg);

		// Update list preview + unread count
		const isInbound = msg.direction === 'inbound';
		patchListEntriesForMessage(msg.conversation_id, (c) => ({
			...c,
			last_message_at: msg.created_at,
			last_message_body: msg.is_internal_note ? c.last_message_body : msg.body,
			last_message_direction: msg.is_internal_note ? c.last_message_direction : msg.direction,
			unread_count: isInbound && !msg.is_internal_note ? c.unread_count + 1 : c.unread_count
		}));
		applyConversationPatch(msg.conversation_id, {
			last_message_at: msg.created_at,
			...(isInbound && !msg.is_internal_note
				? {
						unread_count:
							(threadCache.get(msg.conversation_id)?.conversation?.unread_count ?? 0) + 1
					}
				: {})
		});
	},

	// ── Lifecycle ────────────────────────────────────────────────────────
	invalidate(): void {
		listCache.clear();
		threadCache.clear();
		threadStatusMap.clear();
		threadErrorMap.clear();
		currentListKey = '';
		listStatus = 'idle';
		listError = null;
		if (listController) {
			listController.abort();
			listController = null;
		}
		for (const c of threadControllers.values()) c.abort();
		threadControllers.clear();
	}
};
