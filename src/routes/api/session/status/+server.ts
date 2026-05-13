import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) throw error(401, 'Unauthorized');

	return json({
		status: auth.orgStatus,
		feature_overrides_updated_at: auth.featureOverridesUpdatedAt
	});
};
