import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabase() {
	if (_client) return _client;
	_client = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	return _client;
}
