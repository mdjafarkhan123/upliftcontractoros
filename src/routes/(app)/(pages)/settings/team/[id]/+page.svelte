<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import PhoneField from '$lib/components/shared/PhoneField.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { teamStore } from '$lib/stores/team.svelte';
	import { teamDetailStore } from '$lib/stores/teamDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { PERMISSION_GROUPS } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';
	import type { OrgMember } from '$lib/types';

	let { data }: { data: { id: string } } = $props();

	const member = getMemberContext();

	type DeactivateCounts = {
		assigned_contacts: number;
		open_conversations: number;
		active_jobs: number;
		upcoming_appointments: number;
	};

	const id = $derived(data.id);

	// SWR load — instant if the row was prefetched on hover or seen before.
	$effect(() => {
		void teamDetailStore.load(id);
	});

	const target = $derived(teamDetailStore.get(id));
	const loadError = $derived(teamDetailStore.getError(id));
	const loadingCold = $derived(teamDetailStore.isLoading(id) && !target);

	let fullName = $state('');
	let permissions = $state<PermissionValues>({} as PermissionValues);
	let notificationPhone = $state('');
	let smsNotificationsAllowed = $state(false);
	let emailNotificationsAllowed = $state(true);
	let hourlyCostRate = $state('');
	let phoneError = $state<string | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	const org = getOrgContext();
	const orgCountry = $derived(org().country ?? 'US');

	// Seed the editable name/permissions once per member, when the record first
	// arrives. We don't re-sync on later changes so in-progress edits survive.
	let seededFor = $state('');
	$effect(() => {
		const t = target;
		if (t && seededFor !== id) {
			seededFor = id;
			fullName = t.full_name;
			notificationPhone = t.notification_phone ?? '';
			smsNotificationsAllowed = t.sms_notifications_allowed;
			emailNotificationsAllowed = t.email_notifications_allowed;
			hourlyCostRate = t.hourly_cost_rate ?? '';
			const vals = {} as PermissionValues;
			for (const group of PERMISSION_GROUPS) {
				for (const p of group.permissions) {
					vals[p.key] = t[p.key] as boolean;
				}
			}
			permissions = vals;
		}
	});

	let deactivateOpen = $state(false);
	let deactivating = $state(false);
	let deactivateCounts = $state<DeactivateCounts | null>(null);

	// The 40-toggle PermissionEditor is the heaviest chunk on this page. Load it
	// once the member record arrives so the shell + skeleton paint instantly on
	// click; the editor fetches a beat later behind its own skeleton.
	let PermissionEditor = $state<
		typeof import('$lib/components/team/PermissionEditor.svelte').default | null
	>(null);
	let permissionEditorLoading = $state(false);
	$effect(() => {
		if (!target || PermissionEditor || permissionEditorLoading) return;
		permissionEditorLoading = true;
		void import('$lib/components/team/PermissionEditor.svelte').then((m) => {
			PermissionEditor = m.default;
		});
	});

	// Deactivate confirm dialog — only needed when the user clicks "Deactivate".
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!deactivateOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	const isSelf = $derived(target?.id === member().id);
	const isTargetAdmin = $derived(target?.role === 'admin');
	const canEdit = $derived(member().can_edit_team_members && !isSelf && !isTargetAdmin);
	const canDeactivate = $derived(member().can_delete_team_members && !isSelf);
	// Hourly cost rate (job-costing labor input) is private financial data — same gate as
	// job/quote cost, on top of the general edit-team-member gate.
	const canEditCostRate = $derived(canEdit && member().can_view_revenue);

	const roleLabel = $derived(
		target?.role === 'admin' ? 'Admin' : target?.role === 'manager' ? 'Manager' : 'Member'
	);

	const initials = $derived(
		target
			? target.full_name
					.split(' ')
					.map((p) => p[0] ?? '')
					.slice(0, 2)
					.join('')
					.toUpperCase()
			: ''
	);

	async function savePermissions() {
		if (!canEdit || !target) return;
		saving = true;
		saveError = null;
		phoneError = null;

		const payload: Record<string, unknown> = {};
		if (fullName.trim() !== target.full_name) payload.full_name = fullName.trim();
		payload.notification_phone = notificationPhone.trim() || null;
		payload.sms_notifications_allowed = smsNotificationsAllowed;
		payload.email_notifications_allowed = emailNotificationsAllowed;
		if (canEditCostRate) {
			payload.hourly_cost_rate = hourlyCostRate.trim() || null;
		}
		for (const group of PERMISSION_GROUPS) {
			for (const p of group.permissions) {
				payload[p.key] = permissions[p.key];
			}
		}

		try {
			const res = await fetch(`/api/team/${target.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				phoneError = body.field_errors?.notification_phone ?? null;
				saveError = body.error ?? 'Failed to save changes.';
				return;
			}
			const updated = body.data as OrgMember;
			teamDetailStore.set(id, updated);
			fullName = updated.full_name;
			hourlyCostRate = updated.hourly_cost_rate ?? '';
			teamStore.update({
				id: updated.id,
				full_name: updated.full_name,
				email: updated.email,
				role: updated.role,
				is_active: updated.is_active,
				created_at:
					updated.created_at instanceof Date
						? updated.created_at.toISOString()
						: String(updated.created_at)
			});
			toast.success('Permissions saved');
		} finally {
			saving = false;
		}
	}

	function openDeactivateDialog() {
		deactivateCounts = null;
		deactivateOpen = true;
	}

	async function confirmDeactivate() {
		if (!target) return;
		deactivating = true;
		try {
			const res = await fetch(`/api/team/${target.id}/deactivate`, { method: 'PATCH' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to deactivate member.');
				return;
			}
			const counts = body.data?.counts as DeactivateCounts | undefined;
			deactivateCounts = counts ?? null;

			const snapshot = target!;
			teamDetailStore.set(id, { ...snapshot, is_active: false });
			teamStore.update({
				id: snapshot.id,
				full_name: snapshot.full_name,
				email: snapshot.email,
				role: snapshot.role,
				is_active: false,
				created_at:
					snapshot.created_at instanceof Date
						? snapshot.created_at.toISOString()
						: String(snapshot.created_at)
			});
			toast.success(`${snapshot.full_name} has been deactivated`);
			deactivateOpen = false;

			if (counts) {
				const total =
					counts.assigned_contacts +
					counts.open_conversations +
					counts.active_jobs +
					counts.upcoming_appointments;
				if (total > 0) {
					const parts: string[] = [];
					if (counts.assigned_contacts)
						parts.push(
							`${counts.assigned_contacts} contact${counts.assigned_contacts !== 1 ? 's' : ''}`
						);
					if (counts.open_conversations)
						parts.push(
							`${counts.open_conversations} open conversation${counts.open_conversations !== 1 ? 's' : ''}`
						);
					if (counts.active_jobs)
						parts.push(`${counts.active_jobs} active job${counts.active_jobs !== 1 ? 's' : ''}`);
					if (counts.upcoming_appointments)
						parts.push(
							`${counts.upcoming_appointments} upcoming appointment${counts.upcoming_appointments !== 1 ? 's' : ''}`
						);
					toast.info(`${parts.join(', ')} still assigned — reassign manually.`, { duration: 7000 });
				}
			}
		} finally {
			deactivating = false;
		}
	}
</script>

<svelte:head>
	<title>{target?.full_name ?? 'Team member'}</title>
</svelte:head>

<PageWrapper title={target?.full_name ?? 'Team member'} back="/settings/team">
	{#if loadingCold}
		<div class="settings-form">
			<SkeletonLoader lines={8} label="Loading team member" />
		</div>
	{:else if loadError && !target}
		<div class="settings-form">
			<div class="settings-note settings-note--error">
				<i class="settings-note__icon ri-error-warning-line" aria-hidden="true"></i>
				<p class="settings-note__text">{loadError}</p>
			</div>
		</div>
	{:else if target}
		<div class="settings-form">
			<!-- Profile hero card -->
			<div class="settings-card">
				<div class="settings-card__body">
					<div class="settings-identity">
						<div class="member-avatar member-avatar--lg member-avatar--{target.role}">
							<div class="member-avatar__disc">{initials}</div>
						</div>
						<div class="settings-identity__info">
							<div class="member-card__name-row">
								<span class="settings-identity__name">{target.full_name}</span>
								<span class="role-pill role-pill--{target.role}">{roleLabel}</span>
								{#if !target.is_active}
									<span class="role-pill role-pill--inactive">Inactive</span>
								{/if}
							</div>
							<p class="settings-identity__email">{target.email}</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Role/access notice -->
			{#if isTargetAdmin}
				<div class="settings-note">
					<i class="settings-note__icon ri-information-line" aria-hidden="true"></i>
					<p class="settings-note__text">
						Admin permissions cannot be edited. Admins always have full access.
					</p>
				</div>
			{:else if isSelf}
				<div class="settings-note">
					<i class="settings-note__icon ri-information-line" aria-hidden="true"></i>
					<p class="settings-note__text">You cannot edit your own permissions.</p>
				</div>
			{:else if canEdit && target.role === 'manager'}
				<div class="settings-note settings-note--warning">
					<i class="settings-note__icon ri-alert-line" aria-hidden="true"></i>
					<div>
						<p class="settings-note__title">Editing Manager permissions</p>
						<p class="settings-note__text">
							Changes apply immediately on their next action — no re-login required.
						</p>
					</div>
				</div>
			{:else if canEdit}
				<div class="settings-note">
					<i class="settings-note__icon ri-information-line" aria-hidden="true"></i>
					<p class="settings-note__text">
						Permission changes apply immediately on their next action — no re-login required.
					</p>
				</div>
			{/if}

			<!-- Basic info card -->
			{#if canEdit}
				<div class="settings-card">
					<div class="settings-card__header">
						<div class="settings-card__head-text">
							<p class="settings-card__title">Basic Information</p>
						</div>
					</div>
					<div class="settings-card__body">
						<div class="field">
							<label class="field__label" for="full_name">Full name</label>
							<input id="full_name" class="field__input" bind:value={fullName} maxlength={200} />
						</div>
						{#if canEditCostRate}
							<div class="field">
								<label class="field__label" for="hourly_cost_rate">Hourly cost rate</label>
								<input
									id="hourly_cost_rate"
									class="field__input"
									type="number"
									min="0"
									step="0.01"
									placeholder="0.00"
									bind:value={hourlyCostRate}
								/>
								<p class="field__hint">
									What this member costs the business per hour. Feeds job costing's labor cost once
									they log time — leave blank if unknown.
								</p>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Notifications card -->
			{#if canEdit}
				<div class="settings-card">
					<div class="settings-card__header">
						<div class="settings-card__head-text">
							<p class="settings-card__title">Notifications</p>
							<p class="settings-card__desc">
								Where this member gets internal alerts, and which channels they're allowed.
							</p>
						</div>
					</div>
					<div class="settings-card__body">
						<div class="field">
							<label class="field__label" for="notification_phone">Notification phone</label>
							<PhoneField
								id="notification_phone"
								bind:value={notificationPhone}
								defaultCountry={orgCountry}
								invalid={!!phoneError}
							/>
							{#if phoneError}
								<p class="field__error">{phoneError}</p>
							{:else}
								<p class="field__hint">
									Include the country code. Used only for SMS alerts to this member.
								</p>
							{/if}
						</div>

						<div class="settings-toggle">
							<div class="settings-toggle__text">
								<span class="settings-toggle__label">Allow SMS notifications</span>
								<p class="settings-toggle__desc">
									Text-message alerts use SMS credits. Off by default.
								</p>
							</div>
							<Switch bind:checked={smsNotificationsAllowed} />
						</div>

						<div class="settings-toggle">
							<div class="settings-toggle__text">
								<span class="settings-toggle__label">Allow email notifications</span>
								<p class="settings-toggle__desc">Email alerts are free. On by default.</p>
							</div>
							<Switch bind:checked={emailNotificationsAllowed} />
						</div>
					</div>
				</div>
			{/if}

			<!-- Permissions card -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Permissions</p>
						<p class="settings-card__desc">
							{canEdit
								? 'Toggle individual permissions for this member.'
								: "This member's current access level."}
						</p>
					</div>
				</div>
				<div class="settings-card__body">
					{#if PermissionEditor}
						<PermissionEditor bind:permissions readonly={!canEdit} />
					{:else}
						<SkeletonLoader lines={6} label="Loading permissions" />
					{/if}
				</div>
			</div>

			{#if saveError}
				<div class="settings-note settings-note--error">
					<i class="settings-note__icon ri-error-warning-line" aria-hidden="true"></i>
					<p class="settings-note__text">{saveError}</p>
				</div>
			{/if}

			<!-- Action footer -->
			<div class="team-actions">
				<div class="team-actions__group">
					{#if canDeactivate && target.is_active}
						<Button variant="danger-outline" onclick={openDeactivateDialog}>
							Deactivate member
						</Button>
					{/if}
				</div>
				<div class="team-actions__group">
					<Button variant="secondary" onclick={() => goto('/settings/team')}>Back</Button>
					{#if canEdit}
						<Button
							loadingLabel="Saving…"
							successLabel="Saved"
							loading={saving}
							onAction={savePermissions}
						>
							Save changes
						</Button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</PageWrapper>

{#if ConfirmDialog}
	<ConfirmDialog
		bind:open={deactivateOpen}
		title="Deactivate {target?.full_name ?? 'team member'}?"
		description="They will lose access immediately. Existing assignments are preserved and can be reassigned manually."
		confirmLabel="Deactivate"
		variant="destructive"
		loading={deactivating}
		onConfirm={confirmDeactivate}
	/>
{/if}
