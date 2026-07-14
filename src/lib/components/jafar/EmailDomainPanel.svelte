<script lang="ts">
	import { jafarEmailDomainStore, type EmailDnsRecord } from '$lib/stores/jafarEmailDomain.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';

	let { orgId }: { orgId: string } = $props();

	const store = jafarEmailDomainStore;
	const row = $derived(store.currentId === orgId ? store.row : null);
	const loadStatus = $derived(store.currentId === orgId ? store.status : 'loading');
	const inboundPath = $derived(store.currentId === orgId ? store.inboundPath : null);

	$effect(() => {
		const id = orgId;
		if (id) store.load(id);
	});

	// Source-of-truth inputs. Both prefixes default to sensible values; the PO
	// only has to type the root once. Defaults: sending `contact`, receiving
	// `replies` (closer to what customers see in reply headers).
	let rootInput = $state('');
	let sendingPrefixInput = $state('contact');
	let inboundPrefixInput = $state('replies');
	let submitting = $state(false);
	let verifying = $state(false);
	let polling = $state(false);
	let removing = $state(false);
	let confirmRemoveOpen = $state(false);
	let localError = $state('');
	let copiedKey = $state<string | null>(null);

	const isReady = $derived(row?.status === 'verified');

	// Split records by scope: sending (DKIM/brevo-code/DMARC — Brevo-verified) vs
	// receiving (verification TXT + inbound MX). Older rows predate `scope`, so fall
	// back to inbound_mx → receiving, everything else → sending.
	const scopeOf = (r: EmailDnsRecord) =>
		r.scope ?? (r.purpose === 'inbound_mx' ? 'receiving' : 'sending');
	const sendingRecords = $derived((row?.dns_records ?? []).filter((r) => scopeOf(r) === 'sending'));
	const receivingRecords = $derived(
		(row?.dns_records ?? []).filter((r) => scopeOf(r) === 'receiving')
	);
	// Receiving is ready only when every receiving row is verified (rec.status):
	// the brevo-code TXT (from Brevo) and the inbound MX rows (live DNS lookup).
	// Independent of the sending domain's Brevo status.
	const inboundReady = $derived(
		receivingRecords.length > 0 && receivingRecords.every((r) => r.status === true)
	);
	// Everything green — sending verified by Brevo AND receiving MX live. Auto-poll
	// runs only while a row exists and this is not yet true.
	const allReady = $derived(isReady && inboundReady);
	const shouldPoll = $derived(!!row && !allReady);

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

	// Live, client-side mirror of the server's normalization so the preview shows
	// what will actually be registered. The server re-validates authoritatively.
	const normalizedRoot = $derived(
		rootInput
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.replace(/\/.*$/, '')
			.replace(/^www\./, '')
	);
	const sendingPrefix = $derived(sendingPrefixInput.trim().toLowerCase());
	const inboundPrefix = $derived(inboundPrefixInput.trim().toLowerCase());
	// An empty sending prefix means apex — send from the root itself.
	const previewSending = $derived(
		normalizedRoot ? (sendingPrefix ? `${sendingPrefix}.${normalizedRoot}` : normalizedRoot) : ''
	);
	const previewInbound = $derived(normalizedRoot ? `${inboundPrefix}.${normalizedRoot}` : '');
	const prefixesCollide = $derived(sendingPrefix.length > 0 && sendingPrefix === inboundPrefix);
	const canSubmit = $derived(
		!submitting && normalizedRoot.length > 0 && inboundPrefix.length > 0 && !prefixesCollide
	);

	async function submitDomain(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		submitting = true;
		localError = '';
		const result = await store.create(orgId, {
			root_domain: normalizedRoot,
			sending_prefix: sendingPrefix,
			inbound_prefix: inboundPrefix
		});
		submitting = false;
		if (!result.ok) localError = result.error ?? 'Could not register the domain.';
		else rootInput = '';
	}

	async function runVerify() {
		if (verifying || polling) return;
		verifying = true;
		localError = '';
		const result = await store.verify(orgId);
		verifying = false;
		if (!result.ok) localError = result.error ?? 'Verification failed.';
	}

	// Background status check fired by the auto-poll. Same verify call the button
	// makes, but silent: no spinner on the button (separate flag) and transient
	// failures are swallowed — the manual button is where errors surface. Skips if
	// a manual or background check is already in flight.
	async function pollVerify(id: string) {
		if (verifying || polling) return;
		polling = true;
		await store.verify(id);
		polling = false;
	}

	// Auto-poll, scoped to this org page: starts when a row is present and not yet
	// fully verified, re-checks every 15s so badges flip to green as DNS
	// propagates, and tears down on unmount / org change / once everything is
	// ready (shouldPoll → false). No background work happens off this page.
	$effect(() => {
		const id = orgId;
		if (!shouldPoll) return;
		const interval = setInterval(() => pollVerify(id), 15000);
		return () => clearInterval(interval);
	});

	async function runRemove() {
		if (removing) return;
		removing = true;
		localError = '';
		const result = await store.remove(orgId);
		removing = false;
		if (!result.ok) localError = result.error ?? 'Could not remove the domain.';
	}

	function recordKey(rec: EmailDnsRecord, i: number) {
		return `${rec.purpose}-${i}`;
	}
</script>

<!-- Compact icon copy button, reused across every value cell -->
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

<!-- Resend-style DNS records table. `receiving` rows are verified by live MX
     lookup (rec.status); sending rows fall back to the domain's Brevo status. -->
{#snippet dnsTable(records: EmailDnsRecord[], receiving: boolean)}
	<div class="jafar-dns__tbl">
		<!-- Column header (desktop only) -->
		<div class="jafar-dns__head">
			<span class="jafar-dns__col">Type</span>
			<span class="jafar-dns__col">Host / Name</span>
			<span class="jafar-dns__col">Value</span>
			<span class="jafar-dns__col">Priority</span>
			<span class="jafar-dns__col">Status</span>
		</div>

		<!-- Records -->
		{#each records as rec, i (recordKey(rec, i))}
			{@const verified = receiving ? rec.status === true : rec.status === true || isReady}
			<div class="jafar-dns__row">
				<!-- Label (mobile) -->
				<p class="jafar-dns__mob-label">{rec.label}</p>

				<!-- Type -->
				<div class="jafar-dns__cell">
					<span class="jafar-dns__mob-key">Type</span>
					<span class="jafar-dns__type-pill">{rec.type}</span>
				</div>

				<!-- Host -->
				<div class="jafar-dns__cell">
					<span class="jafar-dns__mob-key">Host</span>
					<code class="jafar-dns__mono">{rec.host || '@'}</code>
					{@render copyButton(rec.host, `host-${recordKey(rec, i)}`)}
				</div>

				<!-- Value -->
				<div class="jafar-dns__cell">
					<span class="jafar-dns__mob-key">Value</span>
					<code class="jafar-dns__mono">{rec.value}</code>
					{@render copyButton(rec.value, `value-${recordKey(rec, i)}`)}
				</div>

				<!-- Priority -->
				<div class="jafar-dns__cell">
					<span class="jafar-dns__mob-key">Priority</span>
					<span class="jafar-dns__mono">{rec.priority ?? '—'}</span>
				</div>

				<!-- Status -->
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
							{receiving ? 'Add record' : 'Pending'}
						</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<section class="jafar-panel">
	<header class="jafar-panel__head">
		<span class="jafar-panel__icon jafar-panel__icon--emerald" aria-hidden="true">
			<i class="ri-mail-line"></i>
		</span>
		<div>
			<h2 class="jafar-panel__title">Email domain</h2>
			<p class="jafar-panel__sub">
				Set up this contractor's sending and receiving email with Brevo. You add the DNS records to
				the contractor's domain provider — they never touch this.
			</p>
		</div>
	</header>

	<div class="jafar-panel__body">
		{#if loadStatus === 'loading' && !row}
			<div class="jafar-dns__poll-note">
				<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
				Loading…
			</div>
		{:else if !row}
			<!-- Empty: create a domain — root + two sibling prefixes -->
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
						placeholder="theirbusiness.com"
						disabled={submitting}
						class="jafar-input jafar-input--mono"
					/>
					<span class="jafar-dns__label-hint">
						The contractor's bare domain — no prefix. Pasting a full URL is fine.
					</span>
				</label>

				<div class="jafar-dns__prefix-grid">
					<label class="jafar-dns__label">
						<span class="jafar-dns__label-text">Sending prefix</span>
						<input
							type="text"
							bind:value={sendingPrefixInput}
							autocomplete="off"
							spellcheck="false"
							placeholder="contact"
							disabled={submitting}
							class="jafar-input jafar-input--mono"
						/>
						<span class="jafar-dns__label-hint">
							Leave blank to send from the root domain (e.g. info@theirbusiness.com).
						</span>
					</label>
					<label class="jafar-dns__label">
						<span class="jafar-dns__label-text">
							Receiving prefix <span class="jafar-dns__req">*</span>
						</span>
						<input
							type="text"
							bind:value={inboundPrefixInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="replies"
							disabled={submitting}
							class="jafar-input jafar-input--mono"
						/>
					</label>
				</div>

				<!-- Live preview — the agency sees both derived domains before saving. -->
				{#if previewSending && previewInbound}
					<div class="jafar-dns__preview">
						<div class="jafar-dns__preview-row">
							<span>Emails send from:</span>
							<code class="jafar-dns__preview-code">{previewSending}</code>
						</div>
						<div class="jafar-dns__preview-row">
							<span>Replies go to:</span>
							<code class="jafar-dns__preview-code">{previewInbound}</code>
						</div>
						{#if prefixesCollide}
							<p class="jafar-dns__collide">Sending and receiving prefixes must be different.</p>
						{/if}
					</div>
				{/if}

				<button type="submit" disabled={!canSubmit} class="jafar-btn jafar-btn--red">
					{#if submitting}
						<i class="ri-loader-4-line j-spin" aria-hidden="true"></i>
						Registering…
					{:else}
						Register domain
					{/if}
				</button>
			</form>
		{:else}
			<!-- Configured: domain header + Resend-style DNS records table -->
			<div class="jafar-dns__domain-hd">
				<div class="jafar-dns__domain-inner">
					<div class="jafar-dns__domain-name">
						<span class="jafar-dns__domain-icon" aria-hidden="true">
							<i class="ri-mail-line"></i>
						</span>
						<p class="jafar-dns__domain-mono">{row.domain}</p>
					</div>
					<div class="jafar-dns__domain-pills">
						<!-- Sending status — from Brevo's domain verification. -->
						<span class="jafar-badge {isReady ? 'jafar-badge--active' : 'jafar-badge--pending'}">
							<span class="jafar-badge__dot"></span>
							Sending {isReady ? 'ready' : 'pending'}
						</span>
						<!-- Receiving status — from live inbound MX lookup. -->
						<span
							class="jafar-badge {inboundReady ? 'jafar-badge--active' : 'jafar-badge--pending'}"
						>
							<span class="jafar-badge__dot"></span>
							Receiving {inboundReady ? 'ready' : 'pending'}
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
					Add these records at the contractor's DNS provider, then click <strong
						>Verify DNS records</strong
					>. DNS changes can take a few minutes up to 48 hours to propagate — "Setup pending" is
					normal until then.
				</p>
			{/if}

			{#if sendingRecords.length > 0}
				<div class="jafar-dns__section">
					<p class="jafar-dns__section-title">Sending</p>
					<p class="jafar-dns__section-sub">
						Authorizes this domain to send email. Verified automatically by Brevo.
					</p>
					{@render dnsTable(sendingRecords, false)}
				</div>
			{/if}

			{#if receivingRecords.length > 0}
				<div class="jafar-dns__section">
					<p class="jafar-dns__section-title">Receiving (replies)</p>
					<p class="jafar-dns__section-sub">
						Routes customer replies back into the inbox. Add these records on the receiving
						subdomain, then click <strong>Verify DNS records</strong>.
					</p>
					{@render dnsTable(receivingRecords, true)}
				</div>
			{/if}

			{#if inboundPath}
				<div class="jafar-dns__inbound-card">
					<p class="jafar-dns__inbound-term">Inbound webhook path</p>
					<div class="jafar-dns__inbound-row">
						<code class="jafar-dns__mono">{inboundPath}</code>
						{@render copyButton(inboundPath ?? '', 'inbound-path')}
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
	title="Remove email domain?"
	description={row
		? `This deletes ${row.domain} from Brevo and clears its setup. You'll need to add the DNS records again to set it up later.`
		: 'This deletes the domain from Brevo and clears its setup.'}
	confirmLabel="Remove domain"
	variant="destructive"
	loading={removing}
	onConfirm={runRemove}
/>
