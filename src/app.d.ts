declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient;
			auth: import('$lib/server/auth/loadAuthContext').AuthContext | null;
		}
	}
}

export {};
