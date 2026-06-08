import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createServiceClient } from '$lib/server/auth/supabase';

const passwordSchema = z
	.object({
		password: z.string().min(8, 'Password must be at least 8 characters.'),
		confirm_password: z.string().min(1, 'Please confirm your password.')
	})
	.refine((d) => d.password === d.confirm_password, {
		message: 'Passwords do not match.',
		path: ['confirm_password']
	});

// Onboarding Step 1 — forced password change. Mirrors the legacy
// /change-password action but is API-first (rule 5) for the CSR wizard.
export const POST: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = passwordSchema.safeParse(body);
	if (!parsed.success) {
		const field_errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = issue.path[0];
			if (typeof key === 'string' && !field_errors[key]) field_errors[key] = issue.message;
		}
		return json({ error: 'Please fix the errors below.', field_errors }, { status: 400 });
	}

	const { error: updateError } = await event.locals.supabase.auth.updateUser({
		password: parsed.data.password
	});
	if (updateError) {
		return json({ error: 'Unable to update password. Try again.' }, { status: 400 });
	}

	const serviceClient = createServiceClient();
	const { error: metadataError } = await serviceClient.auth.admin.updateUserById(
		auth.supabaseUser.id,
		{
			app_metadata: { ...auth.supabaseUser.app_metadata, password_changed: true }
		}
	);
	if (metadataError) {
		return json(
			{ error: 'Password updated, but setup could not continue. Contact support.' },
			{ status: 500 }
		);
	}

	return new Response(null, { status: 204 });
};
