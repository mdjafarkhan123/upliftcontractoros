import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function createServerClient(event: RequestEvent) {
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_ANON_KEY;
	if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required.');

	return createSupabaseServerClient(url, key, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) {
					event.cookies.set(name, value, { ...options, path: '/' });
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
