<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import PermissionEditor from '$lib/components/team/PermissionEditor.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';
	import { teamDetailStore } from '$lib/stores/teamDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { PERMISSION_GROUPS } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';
	import type { OrgMember } from '$lib/types';
	import { AlertTriangle, Info } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';

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
	let phoneError = $state<string | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);

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

	const isSelf = $derived(target?.id === member().id);
	const isTargetAdmin = $derived(target?.role === 'admin');
	const canEdit = $derived(member().can_edit_team_members && !isSelf && !isTargetAdmin);
	const canDeactivate = $derived(member().can_delete_team_members && !isSelf);

	const roleVariant = $derived(
		target?.role === 'admin' ? 'info' : target?.role === 'manager' ? 'warning' : 'default'
	);
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

	const avatarColor = $derived(
		target?.role === 'admin'
			? 'bg-primary/10 text-primary ring-primary/15'
			: target?.role === 'manager'
				? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20'
				: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
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
		<SkeletonLoader lines={8} label="Loading team member" />
	{:else if loadError && !target}
		<div
			class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
		>
			{loadError}
		</div>
	{:else if target}
		<div class="space-y-4">
			<!-- Profile hero card -->
			<div class="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
				<div class="flex items-center gap-4">
					<div
						class={cn(
							'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-2',
							avatarColor
						)}
					>
						{initials}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-base font-semibold text-foreground">{target.full_name}</span>
							<Badge label={roleLabel} variant={roleVariant} />
							{#if !target.is_active}
								<Badge label="Inactive" variant="danger" />
							{/if}
						</div>
						<p class="mt-0.5 text-sm text-muted-foreground">{target.email}</p>
					</div>
				</div>
			</div>

			<!-- Role/access notice -->
			{#if isTargetAdmin}
				<div
					class="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3.5"
				>
					<Info class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">
						Admin permissions cannot be edited. Admins always have full access.
					</p>
				</div>
			{:else if isSelf}
				<div
					class="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3.5"
				>
					<Info class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">You cannot edit your own permissions.</p>
				</div>
			{:else if canEdit && target.role === 'manager'}
				<div
					class="flex items-start gap-3 rounded-xl border border-[hsl(var(--status-warning))]/40 bg-[hsl(var(--status-warning))]/10 px-4 py-3.5"
				>
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-warning))]" />
					<div>
						<p class="text-sm font-medium text-foreground">Editing Manager permissions</p>
						<p class="text-sm text-muted-foreground">
							Changes apply immediately on their next action — no re-login required.
						</p>
					</div>
				</div>
			{:else if canEdit}
				<div
					class="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3.5"
				>
					<Info class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">
						Permission changes apply immediately on their next action — no re-login required.
					</p>
				</div>
			{/if}

			<!-- Basic info card -->
			{#if canEdit}
				<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
					<div class="border-b border-border/60 px-5 py-3.5">
						<p class="text-sm font-semibold text-foreground">Basic Information</p>
					</div>
					<div class="px-5 py-5">
						<div class="space-y-1.5">
							<Label for="full_name">Full name</Label>
							<Input id="full_name" bind:value={fullName} maxlength={200} />
						</div>
					</div>
				</div>
			{/if}

			<!-- Notifications card -->
			{#if canEdit}
				<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
					<div class="border-b border-border/60 px-5 py-3.5">
						<p class="text-sm font-semibold text-foreground">Notifications</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Where this member gets internal alerts, and which channels they're allowed.
						</p>
					</div>
					<div class="px-5 py-5 space-y-4">
						<div class="space-y-1.5">
							<Label for="notification_phone">Notification phone</Label>
							<Input
								id="notification_phone"
								type="tel"
								bind:value={notificationPhone}
								placeholder="+1 555-123-4567"
								autocomplete="off"
							/>
							{#if phoneError}
								<p class="text-xs text-destructive">{phoneError}</p>
							{:else}
								<p class="text-xs text-muted-foreground">
									Include the country code. Used only for SMS alerts to this member.
								</p>
							{/if}
						</div>

						<div class="flex min-h-[52px] items-center justify-between gap-4">
							<div class="flex-1 min-w-0">
								<span class="block text-sm font-medium text-foreground leading-tight">
									Allow SMS notifications
								</span>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Text-message alerts use SMS credits. Off by default.
								</p>
							</div>
							<Switch bind:checked={smsNotificationsAllowed} />
						</div>

						<div class="flex min-h-[52px] items-center justify-between gap-4">
							<div class="flex-1 min-w-0">
								<span class="block text-sm font-medium text-foreground leading-tight">
									Allow email notifications
								</span>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Email alerts are free. On by default.
								</p>
							</div>
							<Switch bind:checked={emailNotificationsAllowed} />
						</div>
					</div>
				</div>
			{/if}

			<!-- Permissions card -->
			<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
				<div class="border-b border-border/60 px-5 py-3.5">
					<p class="text-sm font-semibold text-foreground">Permissions</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						{canEdit
							? 'Toggle individual permissions for this member.'
							: "This member's current access level."}
					</p>
				</div>
				<div class="px-5 py-5">
					<PermissionEditor bind:permissions readonly={!canEdit} />
				</div>
			</div>

			{#if saveError}
				<div
					class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
				>
					{saveError}
				</div>
			{/if}

			<!-- Action footer card -->
			<div
				class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 shadow-sm"
			>
				<div>
					{#if canDeactivate && target.is_active}
						<Button
							variant="outline"
							onclick={openDeactivateDialog}
							class="text-destructive hover:text-destructive hover:border-destructive/50"
						>
							Deactivate member
						</Button>
					{/if}
				</div>
				<div class="flex gap-2">
					<Button variant="outline" onclick={() => goto('/settings/team')}>Back</Button>
					{#if canEdit}
						<JetEngineButton
							label="Save changes"
							loadingLabel="Saving…"
							successLabel="Saved"
							state={saving ? 'loading' : 'idle'}
							onAction={savePermissions}
						/>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</PageWrapper>

<ConfirmDialog
	bind:open={deactivateOpen}
	title="Deactivate {target?.full_name ?? 'team member'}?"
	description="They will lose access immediately. Existing assignments are preserved and can be reassigned manually."
	confirmLabel="Deactivate"
	variant="destructive"
	loading={deactivating}
	onConfirm={confirmDeactivate}
/>
