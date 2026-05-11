declare global {
	namespace App {
		interface Locals {
			supabase: import('@supabase/supabase-js').SupabaseClient;
			safeSession: import('@supabase/supabase-js').Session | null;
			contractorSession?: import('$lib/server/auth/session').ContractorSession;
		}
	}
}

export {};
