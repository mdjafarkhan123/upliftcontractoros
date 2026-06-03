/**
 * Supabase Realtime resilient subscription helper.
 *
 * Backoff: 2s → 4s → 8s → 15s → 30s (cap).
 * - Resets attempts on successful SUBSCRIBED.
 * - Pauses while document is hidden; resumes on visibilitychange.
 * - Reacts to browser online/offline events.
 * - Caps at 10 failed attempts; caller is informed via onPermanentFailure.
 * - Cleans up old channel + timers + listeners before each reconnect and on destroy.
 */
import { getBrowserSupabase, pushRealtimeAuth } from '$lib/supabase/browser';

const BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
const MAX_ATTEMPTS = 10;

export type RealtimeChannelBuilder = (
	supabase: ReturnType<typeof getBrowserSupabase>
) => ReturnType<ReturnType<typeof getBrowserSupabase>['channel']>;

export interface RealtimeManagerOptions {
	build: RealtimeChannelBuilder;
	onStatusChange?: (connected: boolean) => void;
	onPermanentFailure?: () => void;
	onReconnect?: () => void | Promise<void>;
}

export interface RealtimeManager {
	destroy: () => void;
}

export function createRealtimeManager(opts: RealtimeManagerOptions): RealtimeManager {
	const supabase = getBrowserSupabase();
	let cancelled = false;
	let channel: ReturnType<typeof supabase.channel> | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let attempts = 0;
	let connected = false;
	let permanentlyFailed = false;

	function clearTimer() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function teardownChannel() {
		if (channel) {
			try {
				void supabase.removeChannel(channel);
			} catch {
				// ignore
			}
			channel = null;
		}
	}

	function setConnected(next: boolean) {
		if (connected === next) return;
		connected = next;
		opts.onStatusChange?.(next);
	}

	async function connect() {
		if (cancelled || permanentlyFailed) return;
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

		clearTimer();
		teardownChannel();

		try {
			// Re-assert a fresh JWT on every (re)connect — a stale token after a long
			// idle is what makes the socket flap and the UI jump.
			await pushRealtimeAuth();
		} catch {
			scheduleReconnect();
			return;
		}
		if (cancelled) return;

		channel = opts.build(supabase);
		channel.subscribe((status: string) => {
			if (cancelled) return;
			if (status === 'SUBSCRIBED') {
				const wasReconnecting = attempts > 0;
				attempts = 0;
				setConnected(true);
				if (wasReconnecting) void opts.onReconnect?.();
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
				setConnected(false);
				scheduleReconnect();
			}
		});
	}

	function scheduleReconnect() {
		if (cancelled || permanentlyFailed) return;
		if (attempts >= MAX_ATTEMPTS) {
			permanentlyFailed = true;
			setConnected(false);
			opts.onPermanentFailure?.();
			return;
		}
		const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
		attempts++;
		clearTimer();
		reconnectTimer = setTimeout(() => {
			void connect();
		}, delay);
	}

	function handleOnline() {
		if (cancelled || permanentlyFailed) return;
		// Outage just resolved — reset attempts so we try immediately.
		attempts = 0;
		void connect();
	}
	function handleOffline() {
		setConnected(false);
		clearTimer();
		teardownChannel();
	}
	function handleVisibility() {
		if (cancelled || permanentlyFailed) return;
		if (document.visibilityState === 'visible' && !connected) {
			void connect();
		}
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		document.addEventListener('visibilitychange', handleVisibility);
	}

	void connect();

	return {
		destroy() {
			cancelled = true;
			if (typeof window !== 'undefined') {
				window.removeEventListener('online', handleOnline);
				window.removeEventListener('offline', handleOffline);
				document.removeEventListener('visibilitychange', handleVisibility);
			}
			clearTimer();
			teardownChannel();
		}
	};
}
