declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient;
			safeSession: import('@supabase/supabase-js').Session | null;
			auth: import('$lib/server/auth/loadAuthContext').AuthContext | null;
		}
	}
}

export {};
