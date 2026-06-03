/**
 * GET /api/webchat/config?token={widget_token}
 * Public — no auth. Returns widget display config for the pre-session init.
 * Lightweight endpoint so the widget can render the panel before the user submits the form.
 */
import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { organizations, webchatWidgets } from '$lib/server/db/schema';
import { validateOrigin } from '$lib/server/webchat/validateOrigin';
import { resolveLogoUrl } from '$lib/server/media/resolveLogo';

export const GET: RequestHandler = async ({ request, url }) => {
	const token = url.searchParams.get('token');
	if (!token) return json({ error: 'Missing token' }, { status: 400 });

	const [org] = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			logo_url: organizations.logo_url,
			primary_color: organizations.primary_color,
			status: organizations.status,
			feature_webchat: organizations.feature_webchat
		})
		.from(organizations)
		.where(and(eq(organizations.widget_token, token), isNull(organizations.deleted_at)))
		.limit(1);

	if (!org || org.status !== 'active' || !org.feature_webchat) {
		return json({ error: 'Widget not available' }, { status: 404 });
	}

	const [widget] = await db
		.select()
		.from(webchatWidgets)
		.where(and(eq(webchatWidgets.org_id, org.id), eq(webchatWidgets.is_active, true)))
		.limit(1);

	if (!widget) return json({ error: 'Widget not configured' }, { status: 404 });

	// Validate origin if allowlist is non-empty
	if (!validateOrigin(request, widget.domain_allowlist)) {
		return json({ error: 'Origin not permitted' }, { status: 403 });
	}

	return json({
		data: {
			org_name: org.name,
			logo_url: await resolveLogoUrl(org.logo_url),
			primary_color: org.primary_color ?? '#6366f1',
			intro_message:
				widget.intro_message ??
				"We'll text you back — no robocalls, just a real person from our team.",
			offline_message:
				widget.offline_message ??
				"We're currently on site helping customers. Leave your details and we'll reply as soon as possible.",
			webchat_mode: widget.webchat_mode as 'instant' | 'asynchronous'
		}
	});
};
