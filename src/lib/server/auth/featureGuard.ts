import { error } from '@sveltejs/kit';
import type { AuthContext } from './loadAuthContext';
import type { FeatureFlagKey, LimitKey } from '$lib/types';

export function requireFeature(auth: AuthContext, key: FeatureFlagKey): void {
	if (!auth.featureFlags[key]) {
		error(403, { message: `Feature not enabled for this organization.`, code: 'FEATURE_DISABLED', feature: key } as App.Error & Record<string, unknown>);
	}
}

export function requireWithinLimit(auth: AuthContext, key: LimitKey, currentCount: number): void {
	const limit = auth.limits[key];
	if (typeof limit !== 'number') return;
	if (currentCount >= limit) {
		error(403, { message: `Plan limit reached.`, code: 'LIMIT_EXCEEDED', limit: key, max: limit, current: currentCount } as App.Error & Record<string, unknown>);
	}
}

export function requireIntegration(auth: AuthContext, key: string, expected: unknown = true): void {
	const value = auth.integrationStatus[key];
	const ok = expected === true ? Boolean(value) : value === expected;
	if (!ok) {
		error(403, { message: `Required integration is not connected.`, code: 'INTEGRATION_NOT_CONNECTED', integration: key } as App.Error & Record<string, unknown>);
	}
}

export function hasFeature(auth: AuthContext, key: FeatureFlagKey): boolean {
	return Boolean(auth.featureFlags[key]);
}

export function hasIntegration(auth: AuthContext, key: string, expected: unknown = true): boolean {
	const value = auth.integrationStatus[key];
	return expected === true ? Boolean(value) : value === expected;
}
