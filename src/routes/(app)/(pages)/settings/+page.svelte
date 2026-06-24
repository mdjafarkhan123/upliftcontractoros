<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SettingsNav from '$lib/components/settings/SettingsNav.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { cn } from '$lib/utils/cn';

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

	const roleBadgeClass = $derived(
		m.role === 'admin'
			? 'bg-primary/10 text-primary border-primary/20'
			: m.role === 'manager'
				? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
				: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20'
	);
</script>

<svelte:head><title>Settings</title></svelte:head>

<PageWrapper title="Settings" subtitle="Manage your business, automation, and account.">
	<!-- Profile summary card -->
	<a
		href="/settings/account"
		class="mb-6 flex items-center gap-4 rounded-xl border border-border/60 bg-card px-5 py-4 shadow-card transition-all duration-150 ease-out hover:border-border hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
	>
		<div
			class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary ring-2 ring-primary/10"
		>
			{initials}
		</div>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold text-foreground">{m.full_name}</p>
			<p class="truncate text-xs text-muted-foreground">{m.email}</p>
		</div>
		<span
			class={cn(
				'shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
				roleBadgeClass
			)}
		>
			{roleLabel}
		</span>
		<svg
			class="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5"
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg
		>
	</a>

	<SettingsNav
		role={m.role}
		featureAutomation={flags.feature_automation_engine}
		featureOnlineBooking={flags.feature_online_booking}
		canManagePipeline={m.can_manage_pipeline}
		canViewCatalog={m.can_create_quotes || m.can_edit_quotes}
	/>
</PageWrapper>
