<script lang="ts">
	import {
		jafarPlatformEmailDomainStore,
		type EmailDnsRecord
	} from '$lib/stores/jafarPlatformEmailDomain.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';

	const store = jafarPlatformEmailDomainStore;
	const domainState = $derived(store.state);
	const loadStatus = $derived(store.status);

	let rootInput = $state('');
	let sendingPrefixInput = $state('notifications');
	let fromLocalInput = $state('noreply');
	let fromNameInput = $state('Uplift Contractor');
	let submitting = $state(false);
	let verifying = $state(false);
	let polling = $state(false);
	let removing = $state(false);
	let confirmRemoveOpen = $state(false);
	let localError = $state('');
	let copiedKey = $state<string | null>(null);

	$effect(() => {
		store.load();
	});

	const isReady = $derived(domainState?.status === 'verified');
	const records = $derived(domainState?.dns_records ?? []);
	const shouldPoll = $derived(!!domainState?.domain && !isReady);

	async function copyValue(value: string, key: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = null;
			}, 1500);
		} catch {
			// ignore
		}
	}

	// Client-side mirror of the server's normalization so the preview matches what
	// will be registered. The server re-validates authoritatively.
	const normalizedRoot = $derived(
		rootInput
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.replace(/\/.*$/, '')
			.replace(/^www\./, '')
	);
	const sendingPrefix = $derived(sendingPrefixInput.trim().toLowerCase());
	const fromLocal = $derived(fromLocalInput.trim().toLowerCase());
	const fromName = $derived(fromNameInput.trim());
	const previewDomain = $derived(normalizedRoot ? `${sendingPrefix}.${normalizedRoot}` : '');
	const previewFrom = $derived(
		previewDomain && fromLocal ? `${fromName} <${fromLocal}@${previewDomain}>` : ''
	);
	const canSubmit = $derived(
		!submitting &&
			normalizedRoot.length > 0 &&
			sendingPrefix.length > 0 &&
			fromLocal.length > 0 &&
			fromName.length > 0
	);

	async function submitDomain(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		submitting = true;
		localError = '';
		const result = await store.create({
			root_domain: normalizedRoot,
			sending_prefix: sendingPrefix,
			from_local: fromLocal,
			from_name: fromName
		});
		submitting = false;
		if (!result.ok) localError = result.error ?? 'Could not register the domain.';
		else rootInput = '';
	}

	async function runVerify() {
		if (verifying || polling) return;
		verifying = true;
		localError = '';
		const result = await store.verify();
		verifying = false;
		if (!result.ok) localError = result.error ?? 'Verification failed.';
	}

	// Silent background check fired by the auto-poll — no button spinner, transient
	// failures swallowed (the manual button surfaces errors).
	async function pollVerify() {
		if (verifying || polling) return;
		polling = true;
		await store.verify();
		polling = false;
	}

	// Auto-poll: re-check every 15s while a domain exists and isn't verified yet, so
	// badges flip to green as DNS propagates. Tears down once ready / on unmount.
	$effect(() => {
		if (!shouldPoll) return;
		const interval = setInterval(() => pollVerify(), 15000);
		return () => clearInterval(interval);
	});

	async function runRemove() {
		if (removing) return;
		removing = true;
		localError = '';
		const result = await store.remove();
		removing = false;
		if (!result.ok) localError = result.error ?? 'Could not remove the domain.';
	}

	function recordKey(rec: EmailDnsRecord, i: number) {
		return `${rec.purpose}-${i}`;
	}
</script>

{#snippet copyButton(value: string, key: string)}
	<button
		type="button"
		onclick={() => copyValue(value, key)}
		title="Copy"
		aria-label="Copy value"
		class="jafar-dns__copy-btn"
	>
		{#if copiedKey === key}
			<i class="ri-check-line" style="color:#34d399" aria-hidden="true"></i>
		{:else}
			<i class="ri-file-copy-line" aria-hidden="true"></i>
		{/if}
	</button>
{/snippet}

<section class="jafar-panel">
	<header class="jafar-panel__head">
		<span class="jafar-panel__icon jafar-panel__icon--sky" aria-hidden="true">
			<i class="ri-mail-line"></i>
		</span>
		<div>
			<h2 class="jafar-panel__title">Platform email domain</h2>
			<p class="jafar-panel__sub">
				The dedicated subdomain all system &amp; PO mail sends from (carrier alerts, password
				resets, billing). Add the DNS records to your own domain provider, then verify.
			</p>
		</div>
	</header>

	<div class="jafar-panel__body">
		{#if loadStatus === 'loading' && !domainState}
			<div class="jafar-dns__poll-note">
				<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
				Loading…
			</div>
		{:else if !domainState?.domain}
			<!-- Empty: register the platform sending domain -->
			<form onsubmit={submitDomain} class="jafar-dns__form">
				<label class="jafar-dns__label">
					<span class="jafar-dns__label-text">
						Root domain <span class="jafar-dns__req">*</span>
					</span>
					<input
						type="text"
						bind:value={rootInput}
						required
						autocomplete="off"
						spellcheck="false"
						placeholder="yourcompany.com"
						disabled={submitting}
						class="jafar-input jafar-input--mono"
					/>
					<span class="jafar-dns__label-hint">
						Your bare domain — no prefix. Pasting a full URL is fine.
					</span>
				</label>

				<div class="jafar-dns__prefix-grid jafar-dns__prefix-grid--3">
					<label class="jafar-dns__label">
						<span class="jafar-dns__label-text">
							Sending prefix <span class="jafar-dns__req">*</span>
						</span>
						<input
							type="text"
							bind:value={sendingPrefixInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="notifications"
							disabled={submitting}
							class="jafar-input jafar-input--mono"
						/>
					</label>
					<label class="jafar-dns__label">
						<span class="jafar-dns__label-text">
							From (local part) <span class="jafar-dns__req">*</span>
						</span>
						<input
							type="text"
							bind:value={fromLocalInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="noreply"
							disabled={submitting}
							class="jafar-input jafar-input--mono"
						/>
					</label>
					<label class="jafar-dns__label">
						<span class="jafar-dns__label-text">
							Sender name <span class="jafar-dns__req">*</span>
						</span>
						<input
							type="text"
							bind:value={fromNameInput}
							required
							autocomplete="off"
							placeholder="Uplift Contractor"
							disabled={submitting}
							class="jafar-input"
						/>
					</label>
				</div>

				{#if previewFrom}
					<div class="jafar-dns__preview">
						<div class="jafar-dns__preview-row">
							<span>System mail sends from:</span>
							<code class="jafar-dns__preview-code jafar-dns__preview-code--sky">{previewFrom}</code
							>
						</div>
					</div>
				{/if}

				<button type="submit" disabled={!canSubmit} class="jafar-btn jafar-btn--sky">
					{#if submitting}
						<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
						Registering…
					{:else}
						Register domain
					{/if}
				</button>
			</form>
		{:else}
			<!-- Configured: domain header + DNS records table -->
			<div class="jafar-dns__domain-hd">
				<div class="jafar-dns__domain-inner">
					<div class="jafar-dns__domain-name">
						<span class="jafar-dns__domain-icon" aria-hidden="true">
							<i class="ri-mail-line"></i>
						</span>
						<div class="jafar-dns__domain-inner">
							<p class="jafar-dns__domain-mono">{domainState.domain}</p>
							{#if domainState.from_address}
								<p class="jafar-dns__domain-from">{domainState.from_address}</p>
							{/if}
						</div>
					</div>
					<div class="jafar-dns__domain-pills">
						<span class="jafar-badge {isReady ? 'jafar-badge--active' : 'jafar-badge--pending'}">
							<span class="jafar-badge__dot"></span>
							Sending {isReady ? 'ready' : 'pending'}
						</span>
					</div>
					{#if shouldPoll}
						<p class="jafar-dns__poll-note">
							<span class="jafar-dns__poll-dot"></span>
							Auto-checking every 15s — status updates on its own as DNS propagates.
						</p>
					{/if}
				</div>
				<div class="jafar-dns__domain-actions">
					<button
						type="button"
						onclick={runVerify}
						disabled={verifying || polling}
						class="jafar-btn"
					>
						{#if verifying}
							<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
							Checking…
						{:else}
							<i class="ri-refresh-line" aria-hidden="true"></i>
							Verify DNS records
						{/if}
					</button>
					<button
						type="button"
						onclick={() => (confirmRemoveOpen = true)}
						disabled={removing}
						class="jafar-btn jafar-btn--danger"
					>
						{removing ? 'Removing…' : 'Remove'}
					</button>
				</div>
			</div>

			{#if !isReady}
				<p class="jafar-dns__instruction">
					Add these records at your DNS provider, then click <strong>Verify DNS records</strong>.
					DNS changes can take a few minutes up to 48 hours to propagate — "pending" is normal until
					then.
				</p>
			{/if}

			{#if records.length > 0}
				<div class="jafar-dns__section">
					<p class="jafar-dns__section-title">Sending</p>
					<p class="jafar-dns__section-sub">
						Authorizes this domain to send email. Verified automatically by Brevo.
					</p>
					<div class="jafar-dns__tbl jafar-dns__tbl--4col">
						<div class="jafar-dns__head">
							<span class="jafar-dns__col">Type</span>
							<span class="jafar-dns__col">Host / Name</span>
							<span class="jafar-dns__col">Value</span>
							<span class="jafar-dns__col">Status</span>
						</div>

						{#each records as rec, i (recordKey(rec, i))}
							{@const verified = rec.status === true || isReady}
							<div class="jafar-dns__row">
								<p class="jafar-dns__mob-label">{rec.label}</p>

								<div class="jafar-dns__cell">
									<span class="jafar-dns__mob-key">Type</span>
									<span class="jafar-dns__type-pill">{rec.type}</span>
								</div>

								<div class="jafar-dns__cell">
									<span class="jafar-dns__mob-key">Host</span>
									<code class="jafar-dns__mono">{rec.host || '@'}</code>
									{@render copyButton(rec.host, `host-${recordKey(rec, i)}`)}
								</div>

								<div class="jafar-dns__cell">
									<span class="jafar-dns__mob-key">Value</span>
									<code class="jafar-dns__mono">{rec.value}</code>
									{@render copyButton(rec.value, `value-${recordKey(rec, i)}`)}
								</div>

								<div class="jafar-dns__cell">
									<span class="jafar-dns__mob-key">Status</span>
									{#if verified}
										<span class="jafar-dns__v-ok">
											<span class="jafar-dns__v-dot"></span>
											Verified
										</span>
									{:else}
										<span class="jafar-dns__v-pend">
											<span class="jafar-dns__v-dot"></span>
											Pending
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		{#if localError}
			<div role="alert" class="jafar-alert jafar-alert--error jafar-dns__error">
				{localError}
			</div>
		{/if}
	</div>
</section>

<ConfirmDialog
	bind:open={confirmRemoveOpen}
	title="Remove platform email domain?"
	description={domainState?.domain
		? `This deletes ${domainState.domain} from Brevo and clears its setup. System mail falls back to the SYSTEM_FROM_EMAIL env value until you set a domain up again.`
		: 'This deletes the domain from Brevo and clears its setup.'}
	confirmLabel="Remove domain"
	variant="destructive"
	loading={removing}
	onConfirm={runRemove}
/>
