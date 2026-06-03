import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
const env = process.env;

export function createServerClient(event: RequestEvent) {
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_ANON_KEY;
	if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required.');

	return createSupabaseServerClient(url, key, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) {
					try {
						event.cookies.set(name, value, { ...options, path: '/' });
					} catch {
						// `cookies.set` throws if the response has already been sent
						// (e.g. background token refresh after the handler returned).
						// Safe to ignore — the next request will refresh again.
					}
				}
			}
		}
	});
}

export function createServiceClient() {
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

	return createClient(url, key, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}
