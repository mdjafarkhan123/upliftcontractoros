<script lang="ts">
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils/cn';
	import { toast } from '$lib/stores/toast.svelte';
	import { getBrowserSupabase } from '$lib/supabase/browser';
	import { Lock, Eye, EyeOff, AlertCircle, Check, X, Mail, User } from '@lucide/svelte';

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

	const roleBadgeClass = $derived(
		original?.role === 'admin'
			? 'bg-primary/10 text-primary border-primary/20'
			: original?.role === 'manager'
				? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
				: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20'
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
		<div class="mx-auto w-full max-w-2xl space-y-4">
			<SkeletonLoader lines={2} label="Loading profile" height="80px" />
			<SkeletonLoader lines={6} label="Loading account" height="48px" />
		</div>
	{:else}
		<div class="mx-auto w-full max-w-2xl space-y-4 pb-24">
			<!-- Profile header — identity block -->
			<Card
				class="overflow-hidden border-border/60 bg-card shadow-card transition-shadow duration-200 hover:shadow-dropdown"
			>
				<CardContent class="p-5">
					<div class="flex items-center gap-4">
						<div
							class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary ring-2 ring-primary/15"
						>
							{initials}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-base font-semibold text-foreground">
								{original?.full_name}
							</p>
							<p class="truncate text-sm text-muted-foreground">{original?.email}</p>
						</div>
						<span
							class={cn(
								'shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
								roleBadgeClass
							)}
						>
							{roleLabel}
						</span>
					</div>
				</CardContent>
			</Card>

			<!-- Profile section -->
			<p class="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Profile
			</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<Card class="border-border/60 bg-card shadow-card">
					<CardContent class="space-y-5 p-5">
						<div class="flex flex-col gap-1.5">
							<Label for="full_name">
								Full name <span class="text-destructive">*</span>
							</Label>
							<div class="relative">
								<User
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
								/>
								<Input
									id="full_name"
									bind:value={form.full_name}
									required
									maxlength={200}
									autocomplete="name"
									class={cn(
										'pl-9 transition-colors duration-150',
										fieldErrors.full_name &&
											'border-destructive/50 focus-visible:border-destructive focus-visible:ring-destructive/20'
									)}
								/>
							</div>
							{#if fieldErrors.full_name}
								<p class="flex items-center gap-1 text-xs text-destructive">
									<AlertCircle class="h-3 w-3" />
									{fieldErrors.full_name}
								</p>
							{/if}
						</div>

						<div class="flex flex-col gap-1.5">
							<Label for="email">
								Email <span class="text-destructive">*</span>
							</Label>
							<div class="relative">
								<Mail
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
								/>
								<Input
									id="email"
									type="email"
									bind:value={form.email}
									required
									autocomplete="email"
									class={cn(
										'pl-9 transition-colors duration-150',
										fieldErrors.email &&
											'border-destructive/50 focus-visible:border-destructive focus-visible:ring-destructive/20'
									)}
								/>
							</div>
							{#if fieldErrors.email}
								<p class="flex items-center gap-1 text-xs text-destructive">
									<AlertCircle class="h-3 w-3" />
									{fieldErrors.email}
								</p>
							{:else}
								<p class="text-xs text-muted-foreground">
									Changing your email updates the address you use to sign in.
								</p>
							{/if}
						</div>
					</CardContent>

					{#if dirty}
						<div
							class="flex flex-col-reverse items-stretch gap-2 border-t border-border/60 bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end"
						>
							<p
								class="flex items-center gap-2 text-xs font-medium text-amber-700 sm:mr-auto dark:text-amber-400"
							>
								<span class="relative flex h-2 w-2">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
								</span>
								Unsaved changes
							</p>
							<Button
								variant="outline"
								type="button"
								disabled={saving}
								onclick={resetForm}
								class="min-h-[44px] sm:min-h-0"
							>
								Discard
							</Button>
							<Button type="submit" disabled={saving} class="min-h-[44px] sm:min-h-0">
								{saving ? 'Saving…' : 'Save changes'}
							</Button>
						</div>
					{/if}
				</Card>
			</form>

			<!-- Security section -->
			<p class="px-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Security
			</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void changePassword();
				}}
			>
				<Card class="border-border/60 bg-card shadow-card">
					<CardContent class="space-y-5 p-5">
						<div class="flex items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
							>
								<Lock class="h-5 w-5" />
							</div>
							<div class="min-w-0 flex-1">
								<h3 class="text-sm font-semibold text-foreground">Password</h3>
								<p class="text-xs text-muted-foreground">
									Use at least 8 characters. Choose something strong you haven't used elsewhere.
								</p>
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							<Label for="pw_new">
								New password <span class="text-destructive">*</span>
							</Label>
							<div class="relative">
								<Lock
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
								/>
								<Input
									id="pw_new"
									type={showPw.new ? 'text' : 'password'}
									autocomplete="new-password"
									bind:value={pwForm.password}
									minlength={8}
									required
									class="px-9 transition-colors duration-150"
								/>
								<button
									type="button"
									onclick={() => (showPw.new = !showPw.new)}
									aria-label={showPw.new ? 'Hide password' : 'Show password'}
									aria-pressed={showPw.new}
									class="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{#if showPw.new}
										<EyeOff class="h-4 w-4" />
									{:else}
										<Eye class="h-4 w-4" />
									{/if}
								</button>
							</div>
						</div>

						<div class="flex flex-col gap-1.5">
							<Label for="pw_confirm">
								Confirm new password <span class="text-destructive">*</span>
							</Label>
							<div class="relative">
								<Lock
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
								/>
								<Input
									id="pw_confirm"
									type={showPw.confirm ? 'text' : 'password'}
									autocomplete="new-password"
									bind:value={pwForm.confirm}
									minlength={8}
									required
									class="px-9 transition-colors duration-150"
								/>
								<button
									type="button"
									onclick={() => (showPw.confirm = !showPw.confirm)}
									aria-label={showPw.confirm ? 'Hide password' : 'Show password'}
									aria-pressed={showPw.confirm}
									class="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{#if showPw.confirm}
										<EyeOff class="h-4 w-4" />
									{:else}
										<Eye class="h-4 w-4" />
									{/if}
								</button>
							</div>
						</div>

						{#if pwForm.password.length > 0}
							<div
								class="rounded-lg border border-border/60 bg-muted/30 p-3"
								aria-label="Password requirements"
							>
								<ul class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
									{#each pwRules as rule}
										<li
											class={cn(
												'flex items-center gap-1.5 text-xs transition-colors duration-150',
												rule.met
													? 'text-emerald-600 dark:text-emerald-400'
													: 'text-muted-foreground'
											)}
										>
											{#if rule.met}
												<Check class="h-3 w-3" />
											{:else}
												<X class="h-3 w-3" />
											{/if}
											{rule.label}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if pwError}
							<p class="flex items-center gap-1 text-xs text-destructive">
								<AlertCircle class="h-3 w-3" />
								{pwError}
							</p>
						{/if}
					</CardContent>
					<div class="flex justify-end border-t border-border/60 bg-muted/30 px-5 py-4">
						<Button type="submit" disabled={pwSaving || pwForm.password.length === 0}>
							{pwSaving ? 'Updating…' : 'Update password'}
						</Button>
					</div>
				</Card>
			</form>
		</div>
	{/if}
</PageWrapper>
