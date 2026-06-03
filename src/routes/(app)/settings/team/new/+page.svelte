<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import PermissionEditor from '$lib/components/team/PermissionEditor.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getTemplate } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';
	import { Eye, EyeOff, CheckCircle2 } from '@lucide/svelte';

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

	let permissions = $state<PermissionValues>(getTemplate('member'));

	$effect(() => {
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

<PageWrapper
	title="Add team member"
	subtitle="Create a new account and set their access level."
	back="/settings/team"
>
	{#if createdMemberId}
		<!-- Success state -->
		<div class="space-y-4">
			<div
				class="overflow-hidden rounded-xl border border-[hsl(var(--status-active))]/30 bg-card shadow-sm"
			>
				<div class="border-b border-border/60 px-5 py-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--status-active))]/10 text-[hsl(var(--status-active))]"
						>
							<CheckCircle2 class="h-5 w-5" />
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Team member created</p>
							<p class="text-xs text-muted-foreground">
								Share these credentials securely — password shown once
							</p>
						</div>
					</div>
				</div>
				<div class="px-5 py-5 space-y-4">
					<div class="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-4">
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
								Email
							</p>
							<p class="mt-1 font-mono text-sm text-foreground">{email}</p>
						</div>
						<div class="border-t border-border/60 pt-3">
							<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
								Temporary password
							</p>
							<p class="mt-1 font-mono text-sm text-foreground">{createdPassword}</p>
						</div>
					</div>
					<p class="text-xs text-muted-foreground">
						The team member will be prompted to change their password on first login.
					</p>
				</div>
			</div>

			<label
				class="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 transition-colors hover:bg-muted/30"
			>
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
				<Button
					disabled={!passwordCopied}
					onclick={() => goto(`/settings/team/${createdMemberId}`)}
				>
					View member
				</Button>
			</div>
		</div>
	{:else}
		<form class="space-y-4" onsubmit={save}>
			<!-- Basic info card -->
			<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
				<div class="border-b border-border/60 px-5 py-3.5">
					<p class="text-sm font-semibold text-foreground">Basic Information</p>
				</div>
				<div class="px-5 py-5 space-y-4">
					<div class="space-y-1.5">
						<Label for="full_name">Full name <span class="text-destructive">*</span></Label>
						<Input
							id="full_name"
							bind:value={full_name}
							required
							maxlength={200}
							autocomplete="name"
						/>
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
								class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150"
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
						<Select.Root bind:value={role}>
							<Select.Trigger class="h-11 w-full">
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="member">Member — Field worker / crew</Select.Item>
								<Select.Item value="manager">Manager — Office / operations</Select.Item>
							</Select.Content>
						</Select.Root>
						<p class="text-xs text-muted-foreground">
							Role sets the starting permissions below. You can customize them individually.
						</p>
					</div>
				</div>
			</div>

			<!-- Permissions card -->
			<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
				<div class="border-b border-border/60 px-5 py-3.5">
					<p class="text-sm font-semibold text-foreground">Permissions</p>
					<p class="mt-0.5 text-xs text-muted-foreground">
						Pre-filled from role template — toggle to customize
					</p>
				</div>
				<div class="px-5 py-5">
					<PermissionEditor bind:permissions />
				</div>
			</div>

			{#if errorMsg}
				<div
					class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
				>
					{errorMsg}
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<Button
					variant="outline"
					type="button"
					onclick={() => goto('/settings/team')}
					disabled={saving}
				>
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
