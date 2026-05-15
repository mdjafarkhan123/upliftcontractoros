<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import PermissionEditor from '$lib/components/team/PermissionEditor.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getTemplate } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';
	import { Eye, EyeOff } from '@lucide/svelte';

	const member = getMemberContext();

	$effect(() => {
		if (!member().can_create_team_members) goto('/settings/team');
	});

	let full_name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<'manager' | 'member'>('member');
	let showPassword = $state(false);
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	let createdPassword = $state<string | null>(null);
	let createdMemberId = $state<string | null>(null);
	let passwordCopied = $state(false);

	// Permissions preview — syncs with role selection, user can customize
	let permissions = $state<PermissionValues>(getTemplate('member'));

	$effect(() => {
		// When role changes, reset permissions to template
		permissions = getTemplate(role);
	});

	async function save(e: Event) {
		e.preventDefault();
		if (saving) return;
		saving = true;
		errorMsg = null;
		fieldErrors = {};

		const payload = {
			full_name: full_name.trim(),
			email: email.trim(),
			password,
			role,
			...permissions
		};

		try {
			const res = await fetch('/api/team', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));

			if (res.status === 201) {
				const created = body.data;
				teamStore.update(created);
				createdPassword = password;
				createdMemberId = created.id;
				passwordCopied = false;
				toast.success(`${full_name.trim()} added to your team`);
				return;
			}

			if (body.field_errors) fieldErrors = body.field_errors;
			errorMsg = body.error ?? 'Failed to create team member.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>New team member</title></svelte:head>

<PageWrapper title="Add team member" subtitle="Create a new account and set their access level">
	{#if createdMemberId}
		<!-- Success state — show credentials once -->
		<div class="max-w-lg space-y-6">
			<div class="rounded-xl border border-border bg-card p-6 space-y-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--status-active))]/10 text-[hsl(var(--status-active))]">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<div>
						<p class="font-semibold text-foreground">Team member created</p>
						<p class="text-sm text-muted-foreground">Share these credentials securely — password shown once</p>
					</div>
				</div>

				<div class="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
					<div>
						<p class="text-xs font-medium text-muted-foreground">Email</p>
						<p class="font-mono text-sm text-foreground">{email}</p>
					</div>
					<div>
						<p class="text-xs font-medium text-muted-foreground">Temporary password</p>
						<p class="font-mono text-sm text-foreground">{createdPassword}</p>
					</div>
				</div>

				<p class="text-xs text-muted-foreground">
					The team member will be prompted to change their password on first login.
				</p>
			</div>

			<!-- Acknowledgment gate -->
			<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/30">
				<input
					type="checkbox"
					class="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
					bind:checked={passwordCopied}
				/>
				<span class="text-sm text-foreground">
					I have securely copied the password and will share it directly with this team member.
				</span>
			</label>

			<div class="flex gap-3">
				<Button variant="outline" disabled={!passwordCopied} onclick={() => goto('/settings/team')}>
					Back to team
				</Button>
				<Button disabled={!passwordCopied} onclick={() => goto(`/settings/team/${createdMemberId}`)}>
					View member
				</Button>
			</div>
		</div>
	{:else}
		<form class="max-w-lg space-y-6" onsubmit={save}>
			<!-- Basic info -->
			<div class="space-y-4">
				<div class="space-y-1.5">
					<Label for="full_name">Full name <span class="text-destructive">*</span></Label>
					<Input id="full_name" bind:value={full_name} required maxlength={200} autocomplete="name" />
					{#if fieldErrors.full_name}
						<p class="text-xs text-destructive">{fieldErrors.full_name}</p>
					{/if}
				</div>

				<div class="space-y-1.5">
					<Label for="email">Email <span class="text-destructive">*</span></Label>
					<Input id="email" type="email" bind:value={email} required autocomplete="off" />
					{#if fieldErrors.email}
						<p class="text-xs text-destructive">{fieldErrors.email}</p>
					{/if}
				</div>

				<div class="space-y-1.5">
					<Label for="password">Temporary password <span class="text-destructive">*</span></Label>
					<div class="relative">
						<Input
							id="password"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							required
							minlength={8}
							autocomplete="new-password"
							class="pr-10"
						/>
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
					{#if fieldErrors.password}
						<p class="text-xs text-destructive">{fieldErrors.password}</p>
					{/if}
				</div>

				<div class="space-y-1.5">
					<Label for="role">Role <span class="text-destructive">*</span></Label>
					<select
						id="role"
						class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						bind:value={role}
					>
						<option value="member">Member — Field worker / crew</option>
						<option value="manager">Manager — Office / operations</option>
					</select>
					<p class="text-xs text-muted-foreground">
						Role sets the starting permissions below. You can customize them individually.
					</p>
				</div>
			</div>

			<!-- Permission preview -->
			<div class="space-y-3">
				<div>
					<h2 class="text-sm font-semibold text-foreground">Permissions</h2>
					<p class="text-xs text-muted-foreground">Pre-filled from role template — toggle to customize</p>
				</div>
				<PermissionEditor bind:permissions />
			</div>

			{#if errorMsg}
				<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
					{errorMsg}
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-2">
				<Button variant="outline" type="button" onclick={() => goto('/settings/team')} disabled={saving}>
					Cancel
				</Button>
				<JetEngineButton
					type="submit"
					label="Add member"
					loadingLabel="Creating…"
					successLabel="Created"
					state={saving ? 'loading' : 'idle'}
				/>
			</div>
		</form>
	{/if}
</PageWrapper>
