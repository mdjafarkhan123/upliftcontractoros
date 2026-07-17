<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getBrowserSupabase } from '$lib/supabase/browser';

	type Account = {
		id: string;
		full_name: string;
		email: string;
		role: 'admin' | 'manager' | 'member';
		avatar_url: string | null;
	};

	let original = $state<Account | null>(null);
	let form = $state<{ full_name: string; email: string } | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	let pwForm = $state({ password: '', confirm: '' });
	let pwSaving = $state(false);
	let pwError = $state<string | null>(null);
	let showPw = $state({ new: false, confirm: false });

	let dirty = $derived(
		original !== null &&
			form !== null &&
			(form.full_name !== original.full_name ||
				form.email.toLowerCase() !== original.email.toLowerCase())
	);

	const initials = $derived(
		original?.full_name
			?.split(' ')
			.map((p: string) => p[0] ?? '')
			.slice(0, 2)
			.join('')
			.toUpperCase() ?? '?'
	);

	const roleLabel = $derived(
		original?.role === 'admin' ? 'Admin' : original?.role === 'manager' ? 'Manager' : 'Member'
	);

	const pwRules = $derived([
		{ label: 'At least 8 characters', met: pwForm.password.length >= 8 },
		{ label: 'One number', met: /\d/.test(pwForm.password) },
		{ label: 'One uppercase letter', met: /[A-Z]/.test(pwForm.password) }
	]);

	const allRulesMet = $derived(pwRules.every((r) => r.met));

	onMount(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/account');
			const body = (await res.json()) as { data?: Account; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load account');
				return;
			}
			original = body.data;
			form = { full_name: body.data.full_name, email: body.data.email };
		} finally {
			loading = false;
		}
	}

	function resetForm() {
		if (!original) return;
		form = { full_name: original.full_name, email: original.email };
		fieldErrors = {};
	}

	async function save() {
		if (!form || !original) return;
		saving = true;
		fieldErrors = {};
		try {
			const payload: Record<string, unknown> = {};
			if (form.full_name !== original.full_name) payload.full_name = form.full_name;
			if (form.email.toLowerCase() !== original.email.toLowerCase()) payload.email = form.email;

			if (Object.keys(payload).length === 0) {
				toast.info('No changes to save');
				saving = false;
				return;
			}

			const res = await fetch('/api/settings/account', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json().catch(() => ({}))) as {
				data?: Account;
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				original = body.data;
				form = { full_name: body.data.full_name, email: body.data.email };
				toast.success('Account updated');
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}

	async function changePassword() {
		pwError = null;
		if (pwForm.password.length < 8) {
			pwError = 'Password must be at least 8 characters.';
			return;
		}
		if (pwForm.password !== pwForm.confirm) {
			pwError = 'Passwords don’t match.';
			return;
		}
		pwSaving = true;
		try {
			const supabase = getBrowserSupabase();
			const { error } = await supabase.auth.updateUser({ password: pwForm.password });
			if (error) {
				pwError = error.message;
				return;
			}
			pwForm = { password: '', confirm: '' };
			showPw = { new: false, confirm: false };
			toast.success('Password updated');
		} finally {
			pwSaving = false;
		}
	}
</script>

<svelte:head><title>Account Settings</title></svelte:head>

<UnsavedChangesGuard {dirty} />

<PageWrapper title="Account" subtitle="Your name, email, and password" back="/settings">
	{#if loading || !form}
		<div class="settings-form">
			<SkeletonLoader lines={2} label="Loading profile" height="80px" />
			<SkeletonLoader lines={6} label="Loading account" height="48px" />
		</div>
	{:else}
		<div class="settings-form">
			<!-- Identity hero -->
			<div class="settings-card">
				<div class="settings-card__body">
					<div class="settings-identity">
						<div class="settings-identity__avatar">{initials}</div>
						<div class="settings-identity__info">
							<p class="settings-identity__name">{original?.full_name}</p>
							<p class="settings-identity__email">{original?.email}</p>
						</div>
						<span class="role-pill role-pill--{original?.role}">{roleLabel}</span>
					</div>
				</div>
			</div>

			<!-- Profile -->
			<p class="settings-eyebrow">Profile</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<div class="settings-card">
					<div class="settings-card__body">
						<div class="field">
							<label class="field__label field__label--required" for="full_name">Full name</label>
							<div class="field__input-wrap">
								<i class="field__icon ri-user-line" aria-hidden="true"></i>
								<input
									id="full_name"
									class="field__input"
									data-invalid={fieldErrors.full_name ? '' : undefined}
									bind:value={form.full_name}
									required
									maxlength={200}
									autocomplete="name"
								/>
							</div>
							{#if fieldErrors.full_name}
								<p class="field__error">{fieldErrors.full_name}</p>
							{/if}
						</div>

						<div class="field">
							<label class="field__label field__label--required" for="email">Email</label>
							<div class="field__input-wrap">
								<i class="field__icon ri-mail-line" aria-hidden="true"></i>
								<input
									id="email"
									type="email"
									class="field__input"
									data-invalid={fieldErrors.email ? '' : undefined}
									bind:value={form.email}
									required
									autocomplete="email"
								/>
							</div>
							{#if fieldErrors.email}
								<p class="field__error">{fieldErrors.email}</p>
							{:else}
								<p class="field__hint">
									Changing your email updates the address you use to sign in.
								</p>
							{/if}
						</div>
					</div>

					{#if dirty}
						<div class="unsaved-bar">
							<span class="unsaved-bar__status">
								<span class="unsaved-bar__dot"></span>
								Unsaved changes
							</span>
							<Button variant="secondary" disabled={saving} onclick={resetForm}>Discard</Button>
							<Button type="submit" loading={saving} loadingLabel="Saving…">Save changes</Button>
						</div>
					{/if}
				</div>
			</form>

			<!-- Security -->
			<p class="settings-eyebrow">Security</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void changePassword();
				}}
			>
				<div class="settings-card">
					<div class="settings-card__header">
						<span class="settings-card__head-icon"
							><i class="ri-lock-line" aria-hidden="true"></i></span
						>
						<div class="settings-card__head-text">
							<p class="settings-card__title">Password</p>
							<p class="settings-card__desc">
								Use at least 8 characters. Choose something strong you haven't used elsewhere.
							</p>
						</div>
					</div>
					<div class="settings-card__body">
						<div class="field">
							<label class="field__label field__label--required" for="pw_new">New password</label>
							<div class="pw-field">
								<i class="pw-field__icon ri-lock-line" aria-hidden="true"></i>
								<input
									id="pw_new"
									class="field__input"
									type={showPw.new ? 'text' : 'password'}
									autocomplete="new-password"
									bind:value={pwForm.password}
									minlength={8}
									required
								/>
								<button
									type="button"
									class="pw-field__reveal"
									onclick={() => (showPw.new = !showPw.new)}
									aria-label={showPw.new ? 'Hide password' : 'Show password'}
									aria-pressed={showPw.new}
								>
									<i class={showPw.new ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true"></i>
								</button>
							</div>
						</div>

						<div class="field">
							<label class="field__label field__label--required" for="pw_confirm">
								Confirm new password
							</label>
							<div class="pw-field">
								<i class="pw-field__icon ri-lock-line" aria-hidden="true"></i>
								<input
									id="pw_confirm"
									class="field__input"
									type={showPw.confirm ? 'text' : 'password'}
									autocomplete="new-password"
									bind:value={pwForm.confirm}
									minlength={8}
									required
								/>
								<button
									type="button"
									class="pw-field__reveal"
									onclick={() => (showPw.confirm = !showPw.confirm)}
									aria-label={showPw.confirm ? 'Hide password' : 'Show password'}
									aria-pressed={showPw.confirm}
								>
									<i class={showPw.confirm ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true"
									></i>
								</button>
							</div>
						</div>

						{#if pwForm.password.length > 0}
							<div class="pw-rules" aria-label="Password requirements">
								{#each pwRules as rule}
									<span class="pw-rules__item" class:pw-rules__item--met={rule.met}>
										<i class={rule.met ? 'ri-check-line' : 'ri-close-line'} aria-hidden="true"></i>
										{rule.label}
									</span>
								{/each}
							</div>
						{/if}

						{#if pwError}
							<p class="field__error">
								<i class="ri-error-warning-line" aria-hidden="true"></i>
								{pwError}
							</p>
						{/if}
					</div>
					<div class="settings-card__footer">
						<Button
							type="submit"
							disabled={pwForm.password.length === 0}
							loading={pwSaving}
							loadingLabel="Updating…"
						>
							Update password
						</Button>
					</div>
				</div>
			</form>
		</div>
	{/if}
</PageWrapper>
