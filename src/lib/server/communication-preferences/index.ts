export {
	canContactReceiveCommunication,
	resolveCommunicationEligibility,
	type CommunicationEligibilityConsentMatch,
	type CommunicationEligibilityInput,
	type CommunicationEligibilityPreferenceMatch,
	type CommunicationEligibilityResult,
	type CommunicationReachability
} from './eligibility';

export type {
	CommunicationPreferenceCategory,
	CommunicationPreferenceChannel,
	CommunicationPreferenceDirection,
	CommunicationPreferenceStatus
} from '$lib/server/db/schema';

export { communicationCategoryFromSource, type CustomerCommunicationCategory } from './category';
export {
	changeCommunicationConsent,
	changeCommunicationPreference,
	listCommunicationPreferences,
	assertSupportedPreferenceScope,
	CommunicationPreferenceMutationError,
	type ChangeConsentInput,
	type ChangePreferenceInput,
	type PreferenceScope
} from './mutations';
