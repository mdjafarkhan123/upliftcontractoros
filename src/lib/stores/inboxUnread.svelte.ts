// Sidebar Inbox badge: count of OPEN conversations with unread inbound messages,
// scoped per the member's permissions by the server. The server count is always
// authoritative — every realtime nudge (inbound message) and every read action
// schedules a debounced refetch rather than mutating a local tally, so the badge
// never drifts.

let count = $state(0);
let controller: AbortController | null = null;

const REFRESH_DEBOUNCE_MS = 1_500;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchCount(signal: AbortSignal): Promise<number> {
	const res = await fetch('/api/conversations/unread-count', { signal });
	if (!res.ok) throw new Error('Failed to load unread count');
	const body = (await res.json()) as { data: { count: number } };
	return body.data.count;
}

export const inboxUnreadStore = {
	get count(): number {
		return count;
	},

	async load(): Promise<void> {
		if (controller) controller.abort();
		const c = new AbortController();
		controller = c;
		try {
			count = await fetchCount(c.signal);
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') return;
			// Leave the last known count in place on transient failure.
		} finally {
			if (controller === c) controller = null;
		}
	},

	// Debounced authoritative refetch. Bursts (a flurry of inbound messages, or a
	// reconnect replaying events) collapse into a single trailing fetch.
	scheduleRefresh(): void {
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void inboxUnreadStore.load();
		}, REFRESH_DEBOUNCE_MS);
	},

	reset(): void {
		if (controller) {
			controller.abort();
			controller = null;
		}
		if (refreshTimer) {
			clearTimeout(refreshTimer);
			refreshTimer = null;
		}
		count = 0;
	}
};
