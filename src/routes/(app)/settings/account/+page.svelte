<script lang="ts">
	import { onMount } from 'svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/stores/toast.svelte';
	import { getBrowserSupabase } from '$lib/supabase/browser';
	import { Lock } from '@lucide/svelte';

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

	let dirty = $derived(
		original !== null &&
			form !== null &&
			(form.full_name !== original.full_name ||
				form.email.toLowerCase() !== original.email.toLowerCase())
	);

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
		<SkeletonLoader lines={6} label="Loading account" height="48px" />
	{:else}
		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<div class="flex flex-col gap-1.5">
				<Label for="full_name">Full name <span class="text-destructive">*</span></Label>
				<Input id="full_name" bind:value={form.full_name} required maxlength={200} />
				{#if fieldErrors.full_name}
					<p class="text-xs text-destructive">{fieldErrors.full_name}</p>
				{/if}
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="email">Email <span class="text-destructive">*</span></Label>
				<Input id="email" type="email" bind:value={form.email} required />
				{#if fieldErrors.email}
					<p class="text-xs text-destructive">{fieldErrors.email}</p>
				{:else}
					<p class="text-xs text-muted-foreground">
						Changing your email updates the address you use to sign in.
					</p>
				{/if}
			</div>

			<footer class="flex items-center justify-end gap-2 border-t border-border pt-4">
				<Button
					variant="outline"
					type="button"
					disabled={saving || !dirty}
					onclick={() => {
						if (original) form = { full_name: original.full_name, email: original.email };
						fieldErrors = {};
					}}
				>
					Reset
				</Button>
				<Button type="submit" disabled={saving || !dirty}>
					{saving ? 'Saving…' : 'Save changes'}
				</Button>
			</footer>
		</form>

		<p class="mt-10 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
			Security
		</p>

		<section class="mt-3 rounded-xl border border-border bg-card p-5 shadow-sm">
			<div class="mb-4 flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400"
				>
					<Lock class="h-5 w-5" />
				</div>
				<div>
					<h3 class="text-sm font-semibold text-foreground">Change password</h3>
					<p class="text-xs text-muted-foreground">
						Use at least 8 characters. Choose something strong you haven't used elsewhere.
					</p>
				</div>
			</div>

			<form
				class="flex flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					void changePassword();
				}}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="pw_new">New password <span class="text-destructive">*</span></Label>
					<Input
						id="pw_new"
						type="password"
						autocomplete="new-password"
						bind:value={pwForm.password}
						minlength={8}
						required
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="pw_confirm">Confirm password <span class="text-destructive">*</span></Label>
					<Input
						id="pw_confirm"
						type="password"
						autocomplete="new-password"
						bind:value={pwForm.confirm}
						minlength={8}
						required
					/>
				</div>
				{#if pwError}
					<p class="text-xs text-destructive">{pwError}</p>
				{/if}
				<div class="flex justify-end">
					<Button type="submit" disabled={pwSaving}>
						{pwSaving ? 'Updating…' : 'Update password'}
					</Button>
				</div>
			</form>
		</section>
	{/if}
</PageWrapper>
