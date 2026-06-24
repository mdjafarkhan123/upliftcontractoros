<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		MailCheck,
		Clock,
		TriangleAlert,
		Loader2,
		Send,
		Plus,
		Pencil,
		Trash2,
		X,
		Check,
		Inbox,
		ArrowRight
	} from '@lucide/svelte';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { cn } from '$lib/utils/cn';

	type EmailIdentity = {
		from_name: string;
		slug: string;
		email_sender_local: string | null;
		domain: {
			sending_domain: string;
			status: 'pending' | 'verifying' | 'verified' | 'failed';
			from_address: string;
		} | null;
		addresses: { id: string; local_part: string; label: string | null }[];
		has_open_request: boolean;
	};

	const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
	const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

	const member = getMemberContext();
	let m = $derived(member());

	let data = $state<EmailIdentity | null>(null);
	let localInput = $state('');
	let originalLocal = $state('');
	let loading = $state(true);
	let saving = $state(false);

	// Extra addresses (Stage 4a) — self-service, tied to the verified domain.
	let newLocal = $state('');
	let newLabel = $state('');
	let adding = $state(false);
	let addError = $state('');
	let editingId = $state<string | null>(null);
	let editLocal = $state('');
	let editLabel = $state('');
	let savingEdit = $state(false);
	let editError = $state('');
	let deletingId = $state<string | null>(null);

	let newLocalValid = $derived(LOCAL_PART_RE.test(newLocal.trim().toLowerCase()));
	let canAdd = $derived(newLocalValid && !adding);
	let editLocalValid = $derived(LOCAL_PART_RE.test(editLocal.trim().toLowerCase()));

	// Domain change request (Stage 2) — request-to-PO, no self-service DNS.
	let reqDomain = $state('');
	let reqLocal = $state('');
	let reqNote = $state('');
	let submitting = $state(false);
	let reqErrors = $state<Record<string, string>>({});

	let reqDomainValid = $derived(DOMAIN_RE.test(reqDomain.trim().toLowerCase()));
	let reqLocalValid = $derived(
		reqLocal.trim() === '' || LOCAL_PART_RE.test(reqLocal.trim().toLowerCase())
	);
	let canSubmitRequest = $derived(reqDomainValid && reqLocalValid && !submitting);

	let dirty = $derived(data !== null && localInput.trim().toLowerCase() !== originalLocal);
	let valid = $derived(LOCAL_PART_RE.test(localInput.trim().toLowerCase()));
	let validationError = $derived(
		localInput.trim() === ''
			? 'Required.'
			: !valid
				? 'Use lowercase letters, numbers and hyphens only — no leading or trailing hyphen.'
				: ''
	);

	let previewAddress = $derived.by(() => {
		const local = localInput.trim().toLowerCase() || '…';
		const domain = data?.domain?.sending_domain ?? 'your-sending-domain.com';
		return `${local}@${domain}`;
	});

	const STATUS_META = {
		verified: {
			label: 'Email ready',
			icon: MailCheck,
			class:
				'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
		},
		verifying: {
			label: 'Verifying',
			icon: Loader2,
			class:
				'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20'
		},
		pending: {
			label: 'Setup pending',
			icon: Clock,
			class:
				'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
		},
		failed: {
			label: 'Verification failed',
			icon: TriangleAlert,
			class:
				'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
		}
	} as const;

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
	});

	function applyData(d: EmailIdentity) {
		data = d;
		originalLocal = (d.email_sender_local ?? d.slug).toLowerCase();
		localInput = originalLocal;
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/email');
			const body = (await res.json()) as { data?: EmailIdentity; error?: string };
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load email settings');
				return;
			}
			applyData(body.data);
		} finally {
			loading = false;
		}
	}

	async function save() {
		if (!dirty || !valid || saving) return;
		saving = true;
		try {
			const res = await fetch('/api/settings/email', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email_sender_local: localInput.trim().toLowerCase() })
			});
			const body = (await res.json()) as {
				data?: EmailIdentity;
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok || !body.data) {
				toast.error(body.field_errors?.email_sender_local ?? body.error ?? 'Save failed');
				return;
			}
			applyData(body.data);
			toast.success('Email address saved');
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}

	function applyAddresses(list: EmailIdentity['addresses']) {
		if (data) data.addresses = list;
	}

	async function addAddress() {
		if (!canAdd) return;
		adding = true;
		addError = '';
		try {
			const res = await fetch('/api/settings/email/addresses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					local_part: newLocal.trim().toLowerCase(),
					label: newLabel.trim() || undefined
				})
			});
			const body = (await res.json()) as {
				data?: { addresses: EmailIdentity['addresses'] };
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok || !body.data) {
				addError = body.field_errors?.local_part ?? body.error ?? 'Could not add address';
				return;
			}
			applyAddresses(body.data.addresses);
			newLocal = '';
			newLabel = '';
			toast.success('Address added');
		} catch {
			addError = 'Could not add address';
		} finally {
			adding = false;
		}
	}

	function startEdit(row: EmailIdentity['addresses'][number]) {
		editingId = row.id;
		editLocal = row.local_part;
		editLabel = row.label ?? '';
		editError = '';
	}

	function cancelEdit() {
		editingId = null;
		editError = '';
	}

	async function saveEdit(id: string) {
		if (!editLocalValid || savingEdit) return;
		savingEdit = true;
		editError = '';
		try {
			const res = await fetch(`/api/settings/email/addresses/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					local_part: editLocal.trim().toLowerCase(),
					label: editLabel.trim() || null
				})
			});
			const body = (await res.json()) as {
				data?: { addresses: EmailIdentity['addresses'] };
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok || !body.data) {
				editError = body.field_errors?.local_part ?? body.error ?? 'Save failed';
				return;
			}
			applyAddresses(body.data.addresses);
			editingId = null;
			toast.success('Address updated');
		} catch {
			editError = 'Save failed';
		} finally {
			savingEdit = false;
		}
	}

	async function deleteAddress(id: string) {
		if (deletingId) return;
		deletingId = id;
		try {
			const res = await fetch(`/api/settings/email/addresses/${id}`, { method: 'DELETE' });
			const body = (await res.json()) as {
				data?: { addresses: EmailIdentity['addresses'] };
				error?: string;
			};
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Could not remove address');
				return;
			}
			applyAddresses(body.data.addresses);
			if (editingId === id) editingId = null;
			toast.success('Address removed');
		} catch {
			toast.error('Could not remove address');
		} finally {
			deletingId = null;
		}
	}

	async function submitRequest() {
		if (!canSubmitRequest) return;
		submitting = true;
		reqErrors = {};
		try {
			const res = await fetch('/api/settings/email/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					desired_domain: reqDomain.trim().toLowerCase(),
					desired_local_part: reqLocal.trim().toLowerCase() || undefined,
					note: reqNote.trim() || undefined
				})
			});
			if (res.status === 204) {
				toast.success('Request sent — we’ll be in touch shortly');
				reqDomain = '';
				reqLocal = '';
				reqNote = '';
				if (data) data.has_open_request = true;
				return;
			}
			const body = (await res.json()) as {
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (res.status === 409 && data) data.has_open_request = true;
			reqErrors = body.field_errors ?? {};
			toast.error(body.error ?? 'Could not send request');
		} catch {
			toast.error('Could not send request');
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Email Settings</title></svelte:head>

<PageWrapper title="Email" subtitle="Your branded sending address" back="/settings">
	{#if loading || !data}
		<SkeletonLoader lines={6} label="Loading email settings" />
	{:else}
		{@const status = data.domain?.status}
		{@const meta = status ? STATUS_META[status] : null}
		<div class="flex flex-col gap-6">
			<!-- Receive emails (forwarding) — links to the dedicated setup screen -->
			<a
				href="/settings/email/forwarding"
				class="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card transition-all duration-150 ease-out hover:border-border hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
				>
					<Inbox class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="text-sm font-semibold text-foreground">Receive emails</h3>
					<p class="text-xs text-muted-foreground">
						Forward your inbox into the CRM so customer replies land in one place.
					</p>
				</div>
				<ArrowRight
					class="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
				/>
			</a>

			<!-- Sending domain status -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h3 class="text-sm font-semibold text-foreground">Sending domain</h3>
						<p class="text-xs text-muted-foreground">
							Customer emails are sent from your own branded domain.
						</p>
					</div>
					{#if meta}
						<span
							class={cn(
								'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
								meta.class
							)}
						>
							<meta.icon class={cn('h-3 w-3', status === 'verifying' && 'animate-spin')} />
							{meta.label}
						</span>
					{/if}
				</div>

				{#if data.domain}
					<div class="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
						<p class="font-mono text-sm text-foreground">{data.domain.sending_domain}</p>
					</div>
					{#if status !== 'verified'}
						<p class="text-xs text-muted-foreground">
							Your domain is still being set up. Emails will start sending from this address once
							verification completes.
						</p>
					{/if}
				{:else}
					<div
						class="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/10"
					>
						<Clock class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
						<p class="text-xs text-amber-800 dark:text-amber-300">
							Your branded email domain hasn't been set up yet. You can still choose your address
							below — it will take effect once your domain is ready.
						</p>
					</div>
				{/if}
			</section>

			<!-- Editable local-part -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div>
					<h3 class="text-sm font-semibold text-foreground">From address</h3>
					<p class="text-xs text-muted-foreground">
						The part before the @ in your sending address. Customers see this on every email.
					</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="email_sender_local"
						>Address name <span class="text-destructive">*</span></Label
					>
					<div class="flex items-stretch">
						<Input
							id="email_sender_local"
							bind:value={localInput}
							maxlength={64}
							autocapitalize="off"
							autocorrect="off"
							spellcheck={false}
							aria-invalid={validationError ? 'true' : undefined}
							class="rounded-r-none font-mono"
						/>
						<span
							class="inline-flex items-center whitespace-nowrap rounded-r-lg border border-l-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
						>
							@{data.domain?.sending_domain ?? 'your-domain.com'}
						</span>
					</div>
					{#if validationError}
						<p class="text-xs text-destructive">{validationError}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Emails will be sent as
							<span class="font-medium text-foreground">{data.from_name}</span>
							<span class="font-mono text-foreground">&lt;{previewAddress}&gt;</span>
						</p>
					{/if}
				</div>

				<footer class="flex items-center justify-end gap-2 border-t border-border pt-4">
					<Button
						variant="outline"
						type="button"
						disabled={saving || !dirty}
						onclick={() => (localInput = originalLocal)}
					>
						Reset
					</Button>
					<Button type="button" disabled={saving || !dirty || !valid} onclick={() => void save()}>
						{saving ? 'Saving…' : 'Save changes'}
					</Button>
				</footer>
			</section>

			<!-- Additional from-addresses (Stage 4a) — self-service, on the verified domain -->
			{#if data.domain}
				<section
					class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
				>
					<div>
						<h3 class="text-sm font-semibold text-foreground">Additional addresses</h3>
						<p class="text-xs text-muted-foreground">
							Extra sending addresses on your domain (e.g. sales, support). You'll be able to pick
							one when composing an email.
						</p>
					</div>

					{#if data.addresses.length > 0}
						<ul class="flex flex-col gap-2">
							{#each data.addresses as addr (addr.id)}
								<li class="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
									{#if editingId === addr.id}
										<div class="flex flex-col gap-2">
											<div class="flex items-stretch">
												<Input
													bind:value={editLocal}
													maxlength={64}
													autocapitalize="off"
													autocorrect="off"
													spellcheck={false}
													aria-invalid={editError ? 'true' : undefined}
													class="rounded-r-none font-mono"
												/>
												<span
													class="inline-flex items-center whitespace-nowrap rounded-r-lg border border-l-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
												>
													@{data.domain.sending_domain}
												</span>
											</div>
											<Input
												bind:value={editLabel}
												maxlength={40}
												placeholder="Label (optional), e.g. Sales"
											/>
											{#if editError}
												<p class="text-xs text-destructive">{editError}</p>
											{/if}
											<div class="flex items-center justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													type="button"
													disabled={savingEdit}
													onclick={cancelEdit}
												>
													<X class="h-4 w-4" />
													Cancel
												</Button>
												<Button
													size="sm"
													type="button"
													disabled={savingEdit || !editLocalValid}
													onclick={() => void saveEdit(addr.id)}
												>
													<Check class="h-4 w-4" />
													{savingEdit ? 'Saving…' : 'Save'}
												</Button>
											</div>
										</div>
									{:else}
										<div class="flex items-center justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate font-mono text-sm text-foreground">
													{addr.local_part}@{data.domain.sending_domain}
												</p>
												{#if addr.label}
													<p class="truncate text-xs text-muted-foreground">{addr.label}</p>
												{/if}
											</div>
											<div class="flex shrink-0 items-center gap-1">
												<Button
													variant="ghost"
													size="icon"
													type="button"
													aria-label="Edit address"
													onclick={() => startEdit(addr)}
												>
													<Pencil class="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													type="button"
													aria-label="Remove address"
													disabled={deletingId === addr.id}
													onclick={() => void deleteAddress(addr.id)}
												>
													<Trash2 class="h-4 w-4 text-destructive" />
												</Button>
											</div>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-muted-foreground">No extra addresses yet.</p>
					{/if}

					<!-- Add a new address -->
					<div class="flex flex-col gap-2 border-t border-border pt-4">
						<div class="flex items-stretch">
							<Input
								bind:value={newLocal}
								maxlength={64}
								placeholder="sales"
								autocapitalize="off"
								autocorrect="off"
								spellcheck={false}
								aria-invalid={addError || (newLocal.trim() !== '' && !newLocalValid)
									? 'true'
									: undefined}
								class="rounded-r-none font-mono"
							/>
							<span
								class="inline-flex items-center whitespace-nowrap rounded-r-lg border border-l-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
							>
								@{data.domain.sending_domain}
							</span>
						</div>
						<Input
							bind:value={newLabel}
							maxlength={40}
							placeholder="Label (optional), e.g. Sales"
						/>
						{#if addError}
							<p class="text-xs text-destructive">{addError}</p>
						{:else if newLocal.trim() !== '' && !newLocalValid}
							<p class="text-xs text-destructive">
								Lowercase letters, numbers and hyphens only — no leading or trailing hyphen.
							</p>
						{/if}
						<div class="flex items-center justify-end">
							<Button type="button" disabled={!canAdd} onclick={() => void addAddress()}>
								<Plus class="h-4 w-4" />
								{adding ? 'Adding…' : 'Add address'}
							</Button>
						</div>
					</div>
				</section>
			{/if}

			<!-- Request a domain setup / change (PO handles DNS) -->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card"
			>
				<div>
					<h3 class="text-sm font-semibold text-foreground">
						{data.domain ? 'Request a domain change' : 'Request your branded domain'}
					</h3>
					<p class="text-xs text-muted-foreground">
						{data.domain
							? 'Want to send from a different domain (e.g. your apex domain)? Send us a request and we’ll set it up.'
							: 'Tell us the domain you want to send customer emails from. We handle the DNS setup for you.'}
					</p>
				</div>

				{#if data.has_open_request}
					<div
						class="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/10"
					>
						<Clock class="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
						<p class="text-xs text-sky-800 dark:text-sky-300">
							Your request is in our queue. We’ll be in touch shortly — you can submit another once
							this one is resolved.
						</p>
					</div>
				{:else}
					<div class="flex flex-col gap-1.5">
						<Label for="req_domain">Desired domain <span class="text-destructive">*</span></Label>
						<Input
							id="req_domain"
							bind:value={reqDomain}
							placeholder="yourcompany.com"
							autocapitalize="off"
							autocorrect="off"
							spellcheck={false}
							aria-invalid={reqErrors.desired_domain || (reqDomain.trim() !== '' && !reqDomainValid)
								? 'true'
								: undefined}
							class="font-mono"
						/>
						{#if reqErrors.desired_domain}
							<p class="text-xs text-destructive">{reqErrors.desired_domain}</p>
						{:else if reqDomain.trim() !== '' && !reqDomainValid}
							<p class="text-xs text-destructive">Enter a valid domain, e.g. yourcompany.com.</p>
						{/if}
					</div>

					<div class="flex flex-col gap-1.5">
						<Label for="req_local"
							>Preferred address name <span class="text-muted-foreground">(optional)</span></Label
						>
						<Input
							id="req_local"
							bind:value={reqLocal}
							placeholder="info"
							maxlength={64}
							autocapitalize="off"
							autocorrect="off"
							spellcheck={false}
							aria-invalid={reqErrors.desired_local_part || !reqLocalValid ? 'true' : undefined}
							class="font-mono"
						/>
						{#if reqErrors.desired_local_part}
							<p class="text-xs text-destructive">{reqErrors.desired_local_part}</p>
						{:else if !reqLocalValid}
							<p class="text-xs text-destructive">
								Lowercase letters, numbers and hyphens only — no leading or trailing hyphen.
							</p>
						{:else}
							<p class="text-xs text-muted-foreground">
								The part before the @. Leave blank to let us choose.
							</p>
						{/if}
					</div>

					<div class="flex flex-col gap-1.5">
						<Label for="req_note">Note <span class="text-muted-foreground">(optional)</span></Label>
						<Textarea
							id="req_note"
							bind:value={reqNote}
							maxlength={1000}
							rows={3}
							placeholder="Anything else we should know?"
						/>
					</div>

					<footer class="flex items-center justify-end border-t border-border pt-4">
						<Button type="button" disabled={!canSubmitRequest} onclick={() => void submitRequest()}>
							<Send class="h-4 w-4" />
							{submitting ? 'Sending…' : 'Send request'}
						</Button>
					</footer>
				{/if}
			</section>
		</div>
	{/if}
</PageWrapper>
