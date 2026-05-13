import { getContext, setContext } from 'svelte';
import type { FeatureFlags, OrgLimits, IntegrationStatus, FeatureFlagKey } from '$lib/types';

const FEATURE_FLAGS_KEY = Symbol('featureFlags');
const LIMITS_KEY = Symbol('limits');
const INTEGRATION_STATUS_KEY = Symbol('integrationStatus');

export function setFeatureFlagsContext(accessor: () => FeatureFlags): void {
	setContext(FEATURE_FLAGS_KEY, accessor);
}

export function getFeatureFlagsContext(): () => FeatureFlags {
	const a = getContext<() => FeatureFlags>(FEATURE_FLAGS_KEY);
	if (!a) throw new Error('getFeatureFlagsContext called outside (app) layout tree');
	return a;
}

export function hasFeature(flags: FeatureFlags, key: FeatureFlagKey): boolean {
	return Boolean(flags[key]);
}

export function setLimitsContext(accessor: () => OrgLimits): void {
	setContext(LIMITS_KEY, accessor);
}

export function getLimitsContext(): () => OrgLimits {
	const a = getContext<() => OrgLimits>(LIMITS_KEY);
	if (!a) throw new Error('getLimitsContext called outside (app) layout tree');
	return a;
}

export function setIntegrationStatusContext(accessor: () => IntegrationStatus): void {
	setContext(INTEGRATION_STATUS_KEY, accessor);
}

export function getIntegrationStatusContext(): () => IntegrationStatus {
	const a = getContext<() => IntegrationStatus>(INTEGRATION_STATUS_KEY);
	if (!a) throw new Error('getIntegrationStatusContext called outside (app) layout tree');
	return a;
}
