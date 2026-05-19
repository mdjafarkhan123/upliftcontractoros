import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

let _client: ReturnType<typeof createBrowserClient> | null = null;
let _realtimeAuthReady: Promise<void> | null = null;

export function getBrowserSupabase() {
	if (_client) return _client;
	_client = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	// Realtime authorizes postgres_changes against RLS using the JWT on the
	// WebSocket. Without this push, the socket opens with the anon key and
	// RLS-gated INSERT events on `messages` are silently filtered.
	const client = _client;
	_realtimeAuthReady = client.auth.getSession().then(({ data }) => {
		if (data.session?.access_token) {
			client.realtime.setAuth(data.session.access_token);
		}
	});
	client.auth.onAuthStateChange((_event, session) => {
		client.realtime.setAuth(session?.access_token ?? null);
	});

	return _client;
}

// Await this before opening a realtime channel that depends on RLS. Resolves
// once the cached session JWT (if any) has been pushed to the realtime socket.
export function realtimeAuthReady(): Promise<void> {
	return _realtimeAuthReady ?? Promise.resolve();
}
