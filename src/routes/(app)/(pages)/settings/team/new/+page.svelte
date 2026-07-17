<script lang="ts">
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import PhoneField from '$lib/components/shared/PhoneField.svelte';
	import { getOrgContext } from '$lib/context/org';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { getMemberContext } from '$lib/context/member';
	import { teamStore } from '$lib/stores/team.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getTemplate } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';

	const member = getMemberContext();

	$effect(() => {
		if (!member().can_create_team_members) goto('/settings/team');
	});

	let full_name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<'manager' | 'member'>('member');
	let notificationPhone = $state('');
	let smsNotificationsAllowed = $state(false);
	let emailNotificationsAllowed = $state(true);
	let showPassword = $state(false);
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	const org = getOrgContext();
	const orgCountry = $derived(org().country ?? 'US');

	let createdPassword = $state<string | null>(null);
	let createdMemberId = $state<string | null>(null);
	let passwordCopied = $state(false);

	let permissions = $state<PermissionValues>(getTemplate('member'));

	$effect(() => {
		permissions = getTemplate(role);
	});

	// The 40-toggle PermissionEditor is the heaviest chunk on this page. Load it
	// after first render so the form shell paints instantly; it fetches a beat
	// later behind a skeleton.
	let PermissionEditor = $state<
		typeof import('$lib/components/team/PermissionEditor.svelte').default | null
	>(null);
	$effect(() => {
		if (PermissionEditor) return;
		void import('$lib/components/team/PermissionEditor.svelte').then((m) => {
			PermissionEditor = m.default;
		});
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
			notification_phone: notificationPhone.trim() || null,
			sms_notifications_allowed: smsNotificationsAllowed,
			email_notifications_allowed: emailNotificationsAllowed,
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
		<div class="settings-form">
			<div class="settings-card">
				<div class="settings-card__header">
					<span class="settings-card__head-icon">
						<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
					</span>
					<div class="settings-card__head-text">
						<p class="settings-card__title">Team member created</p>
						<p class="settings-card__desc">
							Share these credentials securely — password shown once
						</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="credentials">
						<div class="credentials__field">
							<p class="credentials__label">Email</p>
							<p class="credentials__value">{email}</p>
						</div>
						<div class="credentials__field">
							<p class="credentials__label">Temporary password</p>
							<p class="credentials__value">{createdPassword}</p>
						</div>
					</div>
					<p class="field__hint">
						The team member will be prompted to change their password on first login.
					</p>
				</div>
			</div>

			<label class="copy-confirm">
				<input type="checkbox" bind:checked={passwordCopied} />
				<span>
					I have securely copied the password and will share it directly with this team member.
				</span>
			</label>

			<div class="team-actions__group">
				<Button
					variant="secondary"
					disabled={!passwordCopied}
					onclick={() => goto('/settings/team')}
				>
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
		<form class="settings-form" onsubmit={save}>
			<!-- Basic info card -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Basic Information</p>
					</div>
				</div>
				<div class="settings-card__body">
					<div class="field">
						<label class="field__label field__label--required" for="full_name">Full name</label>
						<input
							id="full_name"
							class="field__input"
							bind:value={full_name}
							required
							maxlength={200}
							autocomplete="name"
						/>
						{#if fieldErrors.full_name}<p class="field__error">{fieldErrors.full_name}</p>{/if}
					</div>

					<div class="field">
						<label class="field__label field__label--required" for="email">Email</label>
						<input
							id="email"
							type="email"
							class="field__input"
							bind:value={email}
							required
							autocomplete="off"
						/>
						{#if fieldErrors.email}<p class="field__error">{fieldErrors.email}</p>{/if}
					</div>

					<div class="field">
						<label class="field__label field__label--required" for="password">
							Temporary password
						</label>
						<div class="pw-field">
							<i class="pw-field__icon ri-lock-line" aria-hidden="true"></i>
							<input
								id="password"
								class="field__input"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								required
								minlength={8}
								autocomplete="new-password"
							/>
							<button
								type="button"
								class="pw-field__reveal"
								onclick={() => (showPassword = !showPassword)}
								aria-label={showPassword ? 'Hide password' : 'Show password'}
							>
								<i class={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true"></i>
							</button>
						</div>
						{#if fieldErrors.password}<p class="field__error">{fieldErrors.password}</p>{/if}
					</div>

					<div class="field">
						<label class="field__label field__label--required" for="role">Role</label>
						<Select.Root bind:value={role}>
							<Select.Trigger>
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="member" label="Member — Field worker / crew">
									Member — Field worker / crew
								</Select.Item>
								<Select.Item value="manager" label="Manager — Office / operations">
									Manager — Office / operations
								</Select.Item>
							</Select.Content>
						</Select.Root>
						<p class="field__hint">
							Role sets the starting permissions below. You can customize them individually.
						</p>
					</div>
				</div>
			</div>

			<!-- Permissions card -->
			<div class="settings-card">
				<div class="settings-card__header">
					<div class="settings-card__head-text">
						<p class="settings-card__title">Permissions</p>
						<p class="settings-card__desc">Pre-filled from role template — toggle to customize</p>
					</div>
				</div>
				<div class="settings-card__body">
					{#if PermissionEditor}
						<PermissionEditor bind:permissions />
					{:else}
						<SkeletonLoader lines={6} label="Loading permissions" />
					{/if}
				</div>
			</div>

			<!-- Notifications card -->
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
							invalid={!!fieldErrors.notification_phone}
						/>
						{#if fieldErrors.notification_phone}
							<p class="field__error">{fieldErrors.notification_phone}</p>
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

			{#if errorMsg}
				<div class="settings-note settings-note--error">
					<i class="settings-note__icon ri-error-warning-line" aria-hidden="true"></i>
					<p class="settings-note__text">{errorMsg}</p>
				</div>
			{/if}

			<div class="team-actions__group" style:justify-content="flex-end">
				<Button
					variant="secondary"
					type="button"
					onclick={() => goto('/settings/team')}
					disabled={saving}
				>
					Cancel
				</Button>
				<Button type="submit" loadingLabel="Creating…" successLabel="Created" loading={saving}>
					Add member
				</Button>
			</div>
		</form>
	{/if}
</PageWrapper>
