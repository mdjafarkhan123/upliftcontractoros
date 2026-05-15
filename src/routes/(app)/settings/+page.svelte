<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SettingsNav from '$lib/components/settings/SettingsNav.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();

	let m = $derived(member());
	let flags = $derived(featureFlags());
</script>

<svelte:head><title>Settings</title></svelte:head>

<PageWrapper title="Settings" subtitle="Manage your business, automation, and account.">
	<SettingsNav
		role={m.role}
		featureAutomation={flags.feature_automation_engine}
		featureStripe={flags.feature_stripe_payments}
	/>
</PageWrapper>
