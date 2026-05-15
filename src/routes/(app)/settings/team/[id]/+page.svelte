<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import PermissionEditor from '$lib/components/team/PermissionEditor.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { PERMISSION_GROUPS } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';
	import type { OrgMember } from '$lib/types';
	import { AlertTriangle } from '@lucide/svelte';

	let { data }: { data: { id: string } } = $props();

	const member = getMemberContext();

	type DeactivateCounts = {
		assigned_contacts: number;
		open_conversations: number;
		active_jobs: number;
		upcoming_appointments: number;
	};

	let target = $state<OrgMember | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	let fullName = $state('');
	let permissions = $state<PermissionValues>({} as PermissionValues);
	let saving = $state(false);
	let saveError = $state<string | null>(null);

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

onMount(async () => {
		try {
			const res = await fetch(`/api/team/${data.id}`);
			if (res.status === 404) { loadError = 'Team member not found.'; return; }
			if (res.status === 403) { loadError = 'You do not have access.'; return; }
			if (!res.ok) { loadError = 'Failed to load team member.'; return; }
			const body = (await res.json()) as { data: OrgMember };
			target = body.data;
			fullName = body.data.full_name;
			// Extract permission values
			const vals = {} as PermissionValues;
			for (const group of PERMISSION_GROUPS) {
				for (const p of group.permissions) {
					vals[p.key] = body.data[p.key] as boolean;
				}
			}
			permissions = vals;
		} catch {
			loadError = 'Failed to load team member.';
		} finally {
			loading = false;
		}
	});

	async function savePermissions() {
		if (!canEdit || !target) return;
		saving = true;
		saveError = null;

		const payload: Record<string, unknown> = {};
		if (fullName.trim() !== target.full_name) payload.full_name = fullName.trim();
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
				saveError = body.error ?? 'Failed to save changes.';
				return;
			}
			const updated = body.data as OrgMember;
			target = updated;
			fullName = updated.full_name;
			teamStore.update({
				id: updated.id,
				full_name: updated.full_name,
				email: updated.email,
				role: updated.role,
				is_active: updated.is_active,
				created_at: updated.created_at instanceof Date
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
			target = { ...snapshot, is_active: false };
			teamStore.update({
				id: snapshot.id,
				full_name: snapshot.full_name,
				email: snapshot.email,
				role: snapshot.role,
				is_active: false,
				created_at: snapshot.created_at instanceof Date
					? snapshot.created_at.toISOString()
					: String(snapshot.created_at)
			});
			toast.success(`${snapshot.full_name} has been deactivated`);
			deactivateOpen = false;

			if (counts) {
				const total = counts.assigned_contacts + counts.open_conversations + counts.active_jobs + counts.upcoming_appointments;
				if (total > 0) {
					const parts: string[] = [];
					if (counts.assigned_contacts) parts.push(`${counts.assigned_contacts} contact${counts.assigned_contacts !== 1 ? 's' : ''}`);
					if (counts.open_conversations) parts.push(`${counts.open_conversations} open conversation${counts.open_conversations !== 1 ? 's' : ''}`);
					if (counts.active_jobs) parts.push(`${counts.active_jobs} active job${counts.active_jobs !== 1 ? 's' : ''}`);
					if (counts.upcoming_appointments) parts.push(`${counts.upcoming_appointments} upcoming appointment${counts.upcoming_appointments !== 1 ? 's' : ''}`);
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

<PageWrapper
	title={target?.full_name ?? 'Team member'}
	subtitle={target?.email}
>
	{#snippet actions()}
		{#if target}
			<Badge label={roleLabel} variant={roleVariant} />
			{#if !target.is_active}
				<Badge label="Inactive" variant="danger" />
			{/if}
		{/if}
	{/snippet}

	{#if loading}
		<SkeletonLoader lines={8} label="Loading team member" />
	{:else if loadError}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
			{loadError}
		</div>
	{:else if target}
		<div class="max-w-lg space-y-8">
			<!-- Name field -->
			{#if canEdit}
				<div class="space-y-1.5">
					<Label for="full_name">Full name</Label>
					<Input id="full_name" bind:value={fullName} maxlength={200} />
				</div>
			{/if}

			<!-- Role/access notices -->
			{#if isTargetAdmin}
				<div class="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">
						Admin permissions cannot be edited. Admins always have full access.
					</p>
				</div>
			{:else if isSelf}
				<div class="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">You cannot edit your own permissions.</p>
				</div>
			{:else if canEdit && target.role === 'manager'}
				<div class="flex items-start gap-3 rounded-xl border border-[hsl(var(--status-warning))]/40 bg-[hsl(var(--status-warning))]/10 px-4 py-3">
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-warning))]" />
					<div>
						<p class="text-sm font-medium text-foreground">Editing Manager permissions</p>
						<p class="text-sm text-muted-foreground">
							Changes apply to their account immediately on their next action — no re-login required.
						</p>
					</div>
				</div>
			{:else if canEdit}
				<div class="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">
						Permission changes apply immediately on their next action — no re-login required.
					</p>
				</div>
			{/if}

			<!-- Permission editor -->
			<div class="space-y-3">
				<h2 class="text-sm font-semibold text-foreground">Permissions</h2>
				<PermissionEditor bind:permissions readonly={!canEdit} />
			</div>

			{#if saveError}
				<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
					{saveError}
				</div>
			{/if}

			<!-- Action buttons -->
			<div class="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
				<div>
					{#if canDeactivate && target.is_active}
						<Button variant="outline" onclick={openDeactivateDialog} class="text-destructive hover:text-destructive hover:border-destructive/50">
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
