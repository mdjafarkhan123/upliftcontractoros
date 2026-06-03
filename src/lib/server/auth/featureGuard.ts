import { error } from '@sveltejs/kit';
import type { AuthContext } from './loadAuthContext';
import type { FeatureFlagKey } from '$lib/types';

// Numeric usage limits are NOT enforced here. They live in `org_usage` and
// are checked via `assertAndIncrementUsage` at each chokepoint (SMS worker,
// media upload, etc.). Team-member cap remains an inline COUNT(*) check in
// the /api/team route — see plan doc.

export function requireFeature(auth: AuthContext, key: FeatureFlagKey): void {
	if (!auth.featureFlags[key]) {
		error(403, {
			message: `Feature not enabled for this organization.`,
			code: 'FEATURE_DISABLED',
			feature: key
		} as App.Error & Record<string, unknown>);
	}
}

export function requireIntegration(auth: AuthContext, key: string, expected: unknown = true): void {
	const value = auth.integrationStatus[key];
	const ok = expected === true ? Boolean(value) : value === expected;
	if (!ok) {
		error(403, {
			message: `Required integration is not connected.`,
			code: 'INTEGRATION_NOT_CONNECTED',
			integration: key
		} as App.Error & Record<string, unknown>);
	}
}

export function hasFeature(auth: AuthContext, key: FeatureFlagKey): boolean {
	return Boolean(auth.featureFlags[key]);
}

export function hasIntegration(auth: AuthContext, key: string, expected: unknown = true): boolean {
	const value = auth.integrationStatus[key];
	return expected === true ? Boolean(value) : value === expected;
}
