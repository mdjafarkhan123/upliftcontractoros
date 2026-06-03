import { toast } from './toast.svelte';
import type { NotificationItem } from '$lib/notifications/navigation';

type Status = 'idle' | 'loading' | 'ready' | 'revalidating' | 'error';

const MAX_ITEMS = 30;

let items = $state<NotificationItem[]>([]);
let unreadCount = $state(0);
let status = $state<Status>('idle');
let error = $state<string | null>(null);
let fetchedAt = 0;
let controller: AbortController | null = null;

// Anything older than this is considered "historical" — Realtime replays after
// reconnect should not produce toasts. Set on subscribe(), refreshed on load().
let subscribedAt = 0;

const STALE_MS = 30_000;

async function fetchList(
	signal: AbortSignal
): Promise<{ items: NotificationItem[]; unread_count: number }> {
	const res = await fetch('/api/notifications', { signal });
	if (!res.ok) throw new Error('Failed to load notifications');
	const body = (await res.json()) as { data: { items: NotificationItem[]; unread_count: number } };
	return body.data;
}

export const notificationStore = {
	get items(): NotificationItem[] {
		return items;
	},
	get unreadCount(): number {
		return unreadCount;
	},
	get status(): Status {
		return status;
	},
	get error(): string | null {
		return error;
	},

	async load(force = false): Promise<void> {
		const fresh = Date.now() - fetchedAt < STALE_MS;
		if (fresh && !force && status === 'ready') return;

		if (controller) controller.abort();
		const c = new AbortController();
		controller = c;
		status = items.length > 0 ? 'revalidating' : 'loading';
		error = null;
		try {
			const body = await fetchList(c.signal);
			items = body.items;
			unreadCount = body.unread_count;
			fetchedAt = Date.now();
			status = 'ready';
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load notifications';
			status = items.length > 0 ? 'ready' : 'error';
		} finally {
			if (controller === c) controller = null;
		}
	},

	async markRead(id: string): Promise<void> {
		const idx = items.findIndex((n) => n.id === id);
		if (idx < 0) return;
		const prev = items[idx];
		if (prev.read_at) return;

		const nowIso = new Date().toISOString();
		const next = items.slice();
		next[idx] = { ...prev, read_at: nowIso };
		items = next;
		unreadCount = Math.max(0, unreadCount - 1);

		try {
			const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
			if (!res.ok) throw new Error('Failed');
		} catch {
			const rb = items.slice();
			const i = rb.findIndex((n) => n.id === id);
			if (i >= 0) rb[i] = { ...rb[i], read_at: null };
			items = rb;
			unreadCount = unreadCount + 1;
		}
	},

	async markAllRead(): Promise<void> {
		if (unreadCount === 0) return;
		const prevItems = items;
		const prevUnread = unreadCount;
		const nowIso = new Date().toISOString();
		items = items.map((n) => (n.read_at ? n : { ...n, read_at: nowIso }));
		unreadCount = 0;

		try {
			const res = await fetch('/api/notifications/read-all', { method: 'POST' });
			if (!res.ok) throw new Error('Failed');
		} catch {
			items = prevItems;
			unreadCount = prevUnread;
		}
	},

	onSubscribed(): void {
		subscribedAt = Date.now();
	},

	applyRealtimeInsert(row: NotificationItem): void {
		if (items.some((n) => n.id === row.id)) return;
		const next = [row, ...items];
		if (next.length > MAX_ITEMS) next.length = MAX_ITEMS;
		items = next;
		if (!row.read_at) unreadCount = unreadCount + 1;

		const createdMs = new Date(row.created_at).getTime();
		if (createdMs >= subscribedAt) {
			toast.info(row.title, row.body ? { description: row.body } : undefined);
		}
	},

	applyRealtimeUpdate(row: NotificationItem): void {
		const idx = items.findIndex((n) => n.id === row.id);
		if (idx < 0) return;
		const prev = items[idx];
		const next = items.slice();
		next[idx] = row;
		items = next;
		if (!prev.read_at && row.read_at) {
			unreadCount = Math.max(0, unreadCount - 1);
		} else if (prev.read_at && !row.read_at) {
			unreadCount = unreadCount + 1;
		}
	},

	reset(): void {
		if (controller) {
			controller.abort();
			controller = null;
		}
		items = [];
		unreadCount = 0;
		status = 'idle';
		error = null;
		fetchedAt = 0;
		subscribedAt = 0;
	}
};
