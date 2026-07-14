<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';

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
		verified: { label: 'Email ready', icon: 'ri-mail-check-line', tone: 'success' },
		verifying: { label: 'Verifying', icon: 'ri-loader-4-line', tone: 'info' },
		pending: { label: 'Setup pending', icon: 'ri-time-line', tone: 'warning' },
		failed: { label: 'Verification failed', icon: 'ri-error-warning-line', tone: 'danger' }
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
		<div class="email-page">
			<!-- Receive emails (forwarding) — links to the dedicated setup screen -->
			<a href="/settings/email/forwarding" class="email-forward-link">
				<span class="email-forward-link__icon">
					<i class="ri-inbox-line" aria-hidden="true"></i>
				</span>
				<div class="email-forward-link__body">
					<h3 class="email-forward-link__title">Receive emails</h3>
					<p class="email-forward-link__desc">
						Forward your inbox into the CRM so customer replies land in one place.
					</p>
				</div>
				<i class="ri-arrow-right-line email-forward-link__arrow" aria-hidden="true"></i>
			</a>

			<!-- Sending domain status -->
			<section class="email-section">
				<div class="email-section__head">
					<div>
						<h3 class="email-section__title">Sending domain</h3>
						<p class="email-section__desc">
							Customer emails are sent from your own branded domain.
						</p>
					</div>
					{#if meta}
						<span class="email-pill email-pill--{meta.tone}">
							<i class="{meta.icon}{status === 'verifying' ? ' email-spin' : ''}" aria-hidden="true"
							></i>
							{meta.label}
						</span>
					{/if}
				</div>

				{#if data.domain}
					<div class="email-mono">
						<p>{data.domain.sending_domain}</p>
					</div>
					{#if status !== 'verified'}
						<p class="email-section__desc">
							Your domain is still being set up. Emails will start sending from this address once
							verification completes.
						</p>
					{/if}
				{:else}
					<div class="email-note email-note--warning">
						<i class="ri-time-line" aria-hidden="true"></i>
						<p>
							Your branded email domain hasn't been set up yet. You can still choose your address
							below — it will take effect once your domain is ready.
						</p>
					</div>
				{/if}
			</section>

			<!-- Editable local-part -->
			<section class="email-section">
				<div>
					<h3 class="email-section__title">From address</h3>
					<p class="email-section__desc">
						The part before the @ in your sending address. Customers see this on every email.
					</p>
				</div>

				<div class="field">
					<Label for="email_sender_local" class="field__label field__label--required"
						>Address name</Label
					>
					<div class="email-addr">
						<Input
							id="email_sender_local"
							bind:value={localInput}
							maxlength={64}
							autocapitalize="off"
							autocorrect="off"
							spellcheck={false}
							aria-invalid={validationError ? 'true' : undefined}
							class="email-addr__input"
						/>
						<span class="email-addr__suffix">
							@{data.domain?.sending_domain ?? 'your-domain.com'}
						</span>
					</div>
					{#if validationError}
						<p class="field__error">{validationError}</p>
					{:else}
						<p class="email-preview">
							Emails will be sent as
							<strong>{data.from_name}</strong>
							<code>&lt;{previewAddress}&gt;</code>
						</p>
					{/if}
				</div>

				<footer class="email-section__footer">
					<Button variant="secondary" disabled={saving || !dirty} onclick={() => (localInput = originalLocal)}>
						Reset
					</Button>
					<Button disabled={!dirty || !valid} loading={saving} loadingLabel="Saving…" onclick={() => void save()}>
						Save changes
					</Button>
				</footer>
			</section>

			<!-- Additional from-addresses (Stage 4a) — self-service, on the verified domain -->
			{#if data.domain}
				<section class="email-section">
					<div>
						<h3 class="email-section__title">Additional addresses</h3>
						<p class="email-section__desc">
							Extra sending addresses on your domain (e.g. sales, support). You'll be able to pick
							one when composing an email.
						</p>
					</div>

					{#if data.addresses.length > 0}
						<ul class="email-addrs">
							{#each data.addresses as addr (addr.id)}
								<li class="email-addr-row">
									{#if editingId === addr.id}
										<div class="email-addr-row__edit">
											<div class="email-addr">
												<Input
													bind:value={editLocal}
													maxlength={64}
													autocapitalize="off"
													autocorrect="off"
													spellcheck={false}
													aria-invalid={editError ? 'true' : undefined}
													class="email-addr__input"
												/>
												<span class="email-addr__suffix">
													@{data.domain.sending_domain}
												</span>
											</div>
											<Input
												bind:value={editLabel}
												maxlength={40}
												placeholder="Label (optional), e.g. Sales"
											/>
											{#if editError}
												<p class="field__error">{editError}</p>
											{/if}
											<div class="email-addr-row__edit-actions">
												<Button variant="secondary" size="sm" disabled={savingEdit} onclick={cancelEdit}>
													<i class="ri-close-line" aria-hidden="true"></i>
													Cancel
												</Button>
												<Button size="sm" disabled={!editLocalValid} loading={savingEdit} loadingLabel="Saving…" onclick={() => void saveEdit(addr.id)}>
													<i class="ri-check-line" aria-hidden="true"></i>
													Save
												</Button>
											</div>
										</div>
									{:else}
										<div class="email-addr-row__view">
											<div class="email-addr-row__main">
												<p class="email-addr-row__email">
													{addr.local_part}@{data.domain.sending_domain}
												</p>
												{#if addr.label}
													<p class="email-addr-row__label">{addr.label}</p>
												{/if}
											</div>
											<div class="email-addr-row__actions">
												<button
													class="email-iconbtn"
													type="button"
													aria-label="Edit address"
													onclick={() => startEdit(addr)}
												>
													<i class="ri-pencil-line" aria-hidden="true"></i>
												</button>
												<button
													class="email-iconbtn email-iconbtn--danger"
													type="button"
													aria-label="Remove address"
													disabled={deletingId === addr.id}
													onclick={() => void deleteAddress(addr.id)}
												>
													<i class="ri-delete-bin-line" aria-hidden="true"></i>
												</button>
											</div>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="email-section__desc">No extra addresses yet.</p>
					{/if}

					<!-- Add a new address -->
					<div class="email-addnew">
						<div class="email-addr">
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
								class="email-addr__input"
							/>
							<span class="email-addr__suffix">
								@{data.domain.sending_domain}
							</span>
						</div>
						<Input
							bind:value={newLabel}
							maxlength={40}
							placeholder="Label (optional), e.g. Sales"
						/>
						{#if addError}
							<p class="field__error">{addError}</p>
						{:else if newLocal.trim() !== '' && !newLocalValid}
							<p class="field__error">
								Lowercase letters, numbers and hyphens only — no leading or trailing hyphen.
							</p>
						{/if}
						<div class="email-addnew__actions">
							<Button disabled={!canAdd} loading={adding} loadingLabel="Adding…" onclick={() => void addAddress()}>
								<i class="ri-add-line" aria-hidden="true"></i>
								Add address
							</Button>
						</div>
					</div>
				</section>
			{/if}

			<!-- Request a domain setup / change (PO handles DNS) -->
			<section class="email-section">
				<div>
					<h3 class="email-section__title">
						{data.domain ? 'Request a domain change' : 'Request your branded domain'}
					</h3>
					<p class="email-section__desc">
						{data.domain
							? 'Want to send from a different domain (e.g. your apex domain)? Send us a request and we’ll set it up.'
							: 'Tell us the domain you want to send customer emails from. We handle the DNS setup for you.'}
					</p>
				</div>

				{#if data.has_open_request}
					<div class="email-note email-note--info">
						<i class="ri-time-line" aria-hidden="true"></i>
						<p>
							Your request is in our queue. We’ll be in touch shortly — you can submit another once
							this one is resolved.
						</p>
					</div>
				{:else}
					<div class="field">
						<Label for="req_domain" class="field__label field__label--required"
							>Desired domain</Label
						>
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
							class="email-input-mono"
						/>
						{#if reqErrors.desired_domain}
							<p class="field__error">{reqErrors.desired_domain}</p>
						{:else if reqDomain.trim() !== '' && !reqDomainValid}
							<p class="field__error">Enter a valid domain, e.g. yourcompany.com.</p>
						{/if}
					</div>

					<div class="field">
						<Label for="req_local" class="field__label"
							>Preferred address name <span class="field__hint">(optional)</span></Label
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
							class="email-input-mono"
						/>
						{#if reqErrors.desired_local_part}
							<p class="field__error">{reqErrors.desired_local_part}</p>
						{:else if !reqLocalValid}
							<p class="field__error">
								Lowercase letters, numbers and hyphens only — no leading or trailing hyphen.
							</p>
						{:else}
							<p class="field__hint">The part before the @. Leave blank to let us choose.</p>
						{/if}
					</div>

					<div class="field">
						<Label for="req_note" class="field__label"
							>Note <span class="field__hint">(optional)</span></Label
						>
						<Textarea
							id="req_note"
							bind:value={reqNote}
							maxlength={1000}
							rows={3}
							placeholder="Anything else we should know?"
						/>
					</div>

					<footer class="email-section__footer">
						<Button disabled={!canSubmitRequest} loading={submitting} loadingLabel="Sending…" onclick={() => void submitRequest()}>
							<i class="ri-send-plane-line" aria-hidden="true"></i>
							Send request
						</Button>
					</footer>
				{/if}
			</section>
		</div>
	{/if}
</PageWrapper>
