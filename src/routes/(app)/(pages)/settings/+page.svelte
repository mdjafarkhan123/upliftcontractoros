<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SettingsNav from '$lib/components/settings/SettingsNav.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();

	let m = $derived(member());
	let flags = $derived(featureFlags());

	const initials = $derived(
		m.full_name
			.split(' ')
			.map((p: string) => p[0] ?? '')
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const roleLabel = $derived(
		m.role === 'admin' ? 'Admin' : m.role === 'manager' ? 'Manager' : 'Member'
	);
</script>

<svelte:head><title>Settings</title></svelte:head>

<PageWrapper title="Settings" subtitle="Manage your business, automation, and account.">
	<a href="/settings/account" class="settings-profile">
		<div class="settings-identity__avatar">{initials}</div>
		<div class="settings-identity__info">
			<p class="settings-identity__name">{m.full_name}</p>
			<p class="settings-identity__email">{m.email}</p>
		</div>
		<span class="role-pill role-pill--{m.role}">{roleLabel}</span>
		<i class="settings-profile__chevron ri-arrow-right-s-line" aria-hidden="true"></i>
	</a>

	<SettingsNav
		role={m.role}
		featureAutomation={flags.feature_automation_engine}
		featureOnlineBooking={flags.feature_online_booking}
		canManagePipeline={m.can_manage_pipeline}
		canViewCatalog={m.can_create_quotes || m.can_edit_quotes}
		canManageJobForms={m.can_view_full_pipeline}
		canManageJobCustomFields={m.can_view_full_pipeline}
	/>
</PageWrapper>
