import type { AuthContext } from './loadAuthContext';
import { featureForPath } from '$lib/permissions/featureMap';

export function checkFeatureForPath(
	pathname: string,
	auth: AuthContext
): { ok: true } | { ok: false; feature: string } {
	const feature = featureForPath(pathname);
	if (!feature) return { ok: true };
	if (auth.featureFlags[feature]) return { ok: true };
	return { ok: false, feature };
}

export function featureDisabledResponse(feature: string): Response {
	return new Response(
		JSON.stringify({
			error: 'Feature not enabled for this organization.',
			code: 'FEATURE_DISABLED',
			feature
		}),
		{ status: 403, headers: { 'content-type': 'application/json' } }
	);
}
