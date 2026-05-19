import { SvelteMap } from 'svelte/reactivity';

// ───── Types ───────────────────────────────────────────────────────────────

export type MessageChannel = 'sms' | 'missed_call' | 'email' | 'webchat';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus =
	| 'sending'
	| 'sent'
	| 'delivered'
	| 'failed'
	| 'received'
	| 'queued'
	| 'bounced'
	| 'undeliverable';

export type ConversationStatus = 'open' | 'closed' | 'snoozed';
export type StatusFilter = ConversationStatus | 'all';
export type AssigneeFilter = 'all' | 'me' | 'unassigned' | string;
export type SnoozePreset = '1h' | '3h' | 'tomorrow_9am' | 'next_week';

export type ConversationListItem = {
	id: string;
	contact_id: string;
	contact_name: string;
	contact_phone: string;
	contact_sms_opt_out: boolean;
	status: ConversationStatus;
	assigned_to: string | null;
	assignee_name: string | null;
	last_message_at: string | null;
	last_inbound_at: string | null;
	last_message_preview: string | null;
	last_message_channel: MessageChannel | null;
	last_message_direction: MessageDirection | null;
	unread_count: number;
	snoozed_until: string | null;
	created_at: string;
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
	reply_to_message_id: string | null;
	failure_reason: string | null;
	failed_at: string | null;
	source: string | null;
	email_subject: string | null;
	email_from_address: string | null;
	opened_at: string | null;
	delivered_at: string | null;
	sent_by: string | null;
	sent_at: string | null;
	read_at: string | null;
	created_at: string;
	updated_at: string;
	_optimistic_key?: string;
};

export type OutboundChannel = 'sms' | 'email' | 'webchat';

export type ConversationDetail = {
	id: string;
	org_id: string;
	contact_id: string;
	status: ConversationStatus;
	subject: string | null;
	assigned_to: string | null;
	assignee_name: string | null;
	last_message_at: string | null;
	last_message_preview: string | null;
	last_message_channel: MessageChannel | null;
	last_message_direction: MessageDirection | null;
	unread_count: number;
	snoozed_until: string | null;
	closed_at: string | null;
	closed_reason: string | null;
	tags: string[];
	suggested_channel: OutboundChannel | null;
	available_channels: OutboundChannel[];
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
	status: StatusFilter;
	assignee: AssigneeFilter;
	unread: boolean;
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
const PREVIEW_LIMIT = 140;

// ───── List cache ──────────────────────────────────────────────────────────

const listCache = new SvelteMap<string, ListEntry>();
let currentListKey = $state('');
let listStatus = $state<ListStatus>('idle');
let listError = $state<string | null>(null);
let listController: AbortController | null = null;

function buildListKey(f: InboxFilters): string {
	return `${f.status}|${f.assignee}|${f.unread ? '1' : '0'}|${f.q.trim()}`;
}

function buildListParams(f: InboxFilters, cursor: string | null): URLSearchParams {
	const p = new URLSearchParams();
	if (f.status !== 'open') p.set('status', f.status);
	if (f.assignee !== 'all') p.set('assignee', f.assignee);
	if (f.unread) p.set('unread', '1');
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
	const body = (await res.json()) as {
		data: { items: ConversationListItem[]; next_cursor: string | null };
	};
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
	const body = (await res.json()) as {
		data: { conversation: ConversationDetail; contact: ContactSummary; context: ThreadContext };
	};
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
	const body = (await res.json()) as {
		data: { items: ThreadMessage[]; next_cursor: string | null };
	};
	return body.data;
}

// ───── Reconcilers ─────────────────────────────────────────────────────────

function previewFor(channel: MessageChannel, body: string | null): string {
	if (channel === 'missed_call') return 'Missed phone call';
	if (!body) return '';
	const trimmed = body.trim();
	return trimmed.length > PREVIEW_LIMIT ? trimmed.slice(0, PREVIEW_LIMIT) : trimmed;
}

function unreadInboundRank(c: ConversationListItem): 0 | 1 {
	return c.unread_count > 0 && c.last_message_direction === 'inbound' ? 1 : 0;
}

// Match server ORDER BY: unread_inbound DESC, last_inbound_at DESC NULLS LAST,
// last_message_at DESC NULLS LAST, id DESC.
function sortInboxList(a: ConversationListItem, b: ConversationListItem): number {
	const ua = unreadInboundRank(a);
	const ub = unreadInboundRank(b);
	if (ua !== ub) return ub - ua;

	const ai = a.last_inbound_at;
	const bi = b.last_inbound_at;
	if (ai !== bi) {
		if (!ai) return 1;
		if (!bi) return -1;
		return ai < bi ? 1 : -1;
	}

	const am = a.last_message_at;
	const bm = b.last_message_at;
	if (am !== bm) {
		if (!am) return 1;
		if (!bm) return -1;
		return am < bm ? 1 : -1;
	}

	return a.id < b.id ? 1 : -1;
}

function patchListEntries(
	conversationId: string,
	mutate: (item: ConversationListItem) => ConversationListItem
): void {
	for (const [k, entry] of listCache) {
		const idx = entry.items.findIndex((c) => c.id === conversationId);
		if (idx < 0) continue;
		const next = entry.items.slice();
		next[idx] = mutate(next[idx]);
		next.sort(sortInboxList);
		listCache.set(k, { ...entry, items: next });
	}
}

function applyMessageToThread(conversationId: string, msg: ThreadMessage): void {
	const entry = threadCache.get(conversationId);
	if (!entry) return;

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
			// swallow
		}
	},

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

	async sendMessage(
		conversationId: string,
		body: string,
		opts: {
			isInternalNote?: boolean;
			channel?: OutboundChannel;
			emailSubject?: string;
		} = {}
	): Promise<{ ok: true; message: ThreadMessage } | { ok: false; error: string }> {
		const isInternal = opts.isInternalNote === true;
		const entry = threadCache.get(conversationId);
		const optimisticKey = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const nowIso = new Date().toISOString();
		const optimisticChannel: MessageChannel =
			opts.channel ?? entry?.conversation?.suggested_channel ?? entry?.conversation?.last_message_channel ?? 'sms';

		const optimistic: ThreadMessage = {
			id: optimisticKey,
			org_id: entry?.conversation?.org_id ?? '',
			conversation_id: conversationId,
			direction: 'outbound',
			channel: optimisticChannel,
			body,
			is_internal_note: isInternal,
			media_urls: null,
			status: 'sending',
			twilio_message_sid: null,
			reply_to_message_id: null,
			failure_reason: null,
			failed_at: null,
			source: 'api',
			email_subject: opts.emailSubject ?? null,
			email_from_address: null,
			opened_at: null,
			delivered_at: null,
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
			const payload: Record<string, unknown> = { body, is_internal_note: isInternal };
			if (opts.channel) payload.channel = opts.channel;
			if (opts.emailSubject) payload.email_subject = opts.emailSubject;
			const res = await fetch(`/api/conversations/${conversationId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const json = (await res.json().catch(() => ({}))) as {
				data?: { message: ThreadMessage };
				error?: string;
			};
			if (!res.ok || !json.data) {
				const cur = threadCache.get(conversationId);
				if (cur) {
					threadCache.set(conversationId, {
						...cur,
						messages: cur.messages.filter((m) => m._optimistic_key !== optimisticKey)
					});
				}
				return { ok: false, error: json.error ?? 'Failed to send message' };
			}

			const cur = threadCache.get(conversationId);
			if (cur) {
				const messages = cur.messages.map((m) =>
					m._optimistic_key === optimisticKey ? json.data!.message : m
				);
				threadCache.set(conversationId, { ...cur, messages });
			}

			if (!isInternal) {
				const confirmed = json.data.message;
				patchListEntries(conversationId, (c) => ({
					...c,
					last_message_at: confirmed.created_at,
					last_message_preview: previewFor(confirmed.channel, confirmed.body),
					last_message_channel: confirmed.channel,
					last_message_direction: 'outbound'
				}));
				applyConversationPatch(conversationId, {
					last_message_at: confirmed.created_at,
					last_message_preview: previewFor(confirmed.channel, confirmed.body),
					last_message_channel: confirmed.channel,
					last_message_direction: 'outbound'
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
		applyConversationPatch(conversationId, { unread_count: 0 });
		patchListEntries(conversationId, (c) => ({ ...c, unread_count: 0 }));
		try {
			await fetch(`/api/conversations/${conversationId}/read`, { method: 'PATCH' });
		} catch {
			// silent
		}
	},

	async setStatus(
		conversationId: string,
		status: 'open' | 'closed',
		reason?: string
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const before = threadCache.get(conversationId)?.conversation?.status;
		applyConversationPatch(conversationId, { status });
		try {
			const res = await fetch(`/api/conversations/${conversationId}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status, reason })
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

	async snooze(
		conversationId: string,
		preset: SnoozePreset
	): Promise<{ ok: true } | { ok: false; error: string }> {
		try {
			const res = await fetch(`/api/conversations/${conversationId}/snooze`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ preset })
			});
			const json = (await res.json().catch(() => ({}))) as {
				data?: { conversation: ConversationDetail };
				error?: string;
			};
			if (!res.ok || !json.data) {
				return { ok: false, error: json.error ?? 'Failed to snooze' };
			}
			applyConversationPatch(conversationId, {
				status: 'snoozed',
				snoozed_until: json.data.conversation.snoozed_until
			});
			return { ok: true };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
		}
	},

	async unsnooze(conversationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
		try {
			const res = await fetch(`/api/conversations/${conversationId}/snooze`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				const json = (await res.json().catch(() => ({}))) as { error?: string };
				return { ok: false, error: json.error ?? 'Failed to unsnooze' };
			}
			applyConversationPatch(conversationId, { status: 'open', snoozed_until: null });
			return { ok: true };
		} catch (e) {
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

	applyRealtimeMessageInsert(msg: ThreadMessage): void {
		applyMessageToThread(msg.conversation_id, msg);

		const isInbound = msg.direction === 'inbound';
		const isInternal = msg.is_internal_note;
		const newPreview = previewFor(msg.channel, msg.body);

		patchListEntries(msg.conversation_id, (c) => ({
			...c,
			last_message_at: msg.created_at,
			last_inbound_at:
				isInbound && !isInternal ? msg.created_at : c.last_inbound_at,
			last_message_preview: isInternal ? c.last_message_preview : newPreview,
			last_message_channel: isInternal ? c.last_message_channel : msg.channel,
			last_message_direction: isInternal ? c.last_message_direction : msg.direction,
			unread_count: isInbound && !isInternal ? c.unread_count + 1 : c.unread_count
		}));

		const currentDetail = threadCache.get(msg.conversation_id)?.conversation;
		const nextUnread =
			isInbound && !isInternal ? (currentDetail?.unread_count ?? 0) + 1 : currentDetail?.unread_count;
		applyConversationPatch(msg.conversation_id, {
			last_message_at: msg.created_at,
			last_message_preview: isInternal ? currentDetail?.last_message_preview ?? null : newPreview,
			last_message_channel: isInternal ? currentDetail?.last_message_channel ?? null : msg.channel,
			last_message_direction: isInternal
				? currentDetail?.last_message_direction ?? null
				: msg.direction,
			...(nextUnread !== undefined ? { unread_count: nextUnread } : {})
		});
	},

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
