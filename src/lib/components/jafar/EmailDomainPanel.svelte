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
	const previewSending = $derived(normalizedRoot ? `${sendingPrefix}.${normalizedRoot}` : '');
	const previewInbound = $derived(normalizedRoot ? `${inboundPrefix}.${normalizedRoot}` : '');
	const prefixesCollide = $derived(sendingPrefix.length > 0 && sendingPrefix === inboundPrefix);
	const canSubmit = $derived(
		!submitting &&
			normalizedRoot.length > 0 &&
			sendingPrefix.length > 0 &&
			inboundPrefix.length > 0 &&
			!prefixesCollide
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
		class="shrink-0 inline-flex size-6 items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:bg-slate-700/60 hover:text-white transition-colors cursor-pointer"
	>
		{#if copiedKey === key}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-emerald-400"
				aria-hidden="true"
			>
				<polyline points="20 6 9 17 4 12" />
			</svg>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
				<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
			</svg>
		{/if}
	</button>
{/snippet}

<!-- Resend-style DNS records table. `receiving` rows are verified by live MX
     lookup (rec.status); sending rows fall back to the domain's Brevo status. -->
{#snippet dnsTable(records: EmailDnsRecord[], receiving: boolean)}
	<div class="mt-3 overflow-hidden rounded-xl border border-slate-800">
		<!-- Column header (desktop only) -->
		<div
			class="hidden items-center gap-x-4 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5 sm:grid sm:grid-cols-[72px_minmax(0,1.1fr)_minmax(0,2fr)_60px_112px]"
		>
			<span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Type</span>
			<span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500"
				>Host / Name</span
			>
			<span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Value</span>
			<span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Priority</span
			>
			<span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
		</div>

		<!-- Records -->
		<div class="divide-y divide-slate-800">
			{#each records as rec, i (recordKey(rec, i))}
				{@const verified = receiving ? rec.status === true : rec.status === true || isReady}
				<div
					class="grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 py-3.5 sm:grid-cols-[72px_minmax(0,1.1fr)_minmax(0,2fr)_60px_112px] sm:items-center sm:gap-y-1"
				>
					<!-- Label (mobile) -->
					<p class="text-xs font-semibold text-slate-200 sm:hidden">{rec.label}</p>

					<!-- Type -->
					<div class="flex items-center gap-2">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:hidden"
							>Type</span
						>
						<span
							class="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300"
						>
							{rec.type}
						</span>
					</div>

					<!-- Host -->
					<div class="flex items-center gap-2 min-w-0">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:hidden"
							>Host</span
						>
						<code class="truncate font-mono text-xs text-slate-200">{rec.host || '@'}</code>
						{@render copyButton(rec.host, `host-${recordKey(rec, i)}`)}
					</div>

					<!-- Value -->
					<div class="flex items-center gap-2 min-w-0">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:hidden"
							>Value</span
						>
						<code class="truncate font-mono text-xs text-slate-200">{rec.value}</code>
						{@render copyButton(rec.value, `value-${recordKey(rec, i)}`)}
					</div>

					<!-- Priority -->
					<div class="flex items-center gap-2">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:hidden"
							>Priority</span
						>
						<span class="font-mono text-xs text-slate-300">{rec.priority ?? '—'}</span>
					</div>

					<!-- Status -->
					<div class="flex items-center gap-2">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:hidden"
							>Status</span
						>
						{#if verified}
							<span class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
								<span class="size-1.5 rounded-full bg-emerald-400"></span>
								Verified
							</span>
						{:else}
							<span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
								<span class="size-1.5 rounded-full bg-amber-400"></span>
								{receiving ? 'Add record' : 'Pending'}
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/snippet}

<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
		<span
			class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
			aria-hidden="true"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="17"
				height="17"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="2" y="4" width="20" height="16" rx="2" />
				<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
			</svg>
		</span>
		<div>
			<h2 class="text-base font-semibold text-white">Email domain</h2>
			<p class="mt-1 text-sm text-slate-300">
				Set up this contractor's sending and receiving email with Brevo. You add the DNS records to
				the contractor's domain provider — they never touch this.
			</p>
		</div>
	</header>

	<div class="px-5 py-5">
		{#if loadStatus === 'loading' && !row}
			<div class="flex items-center gap-2 text-sm text-slate-400">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="animate-spin"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
				Loading…
			</div>
		{:else if !row}
			<!-- Empty: create a domain — root + two sibling prefixes -->
			<form onsubmit={submitDomain} class="space-y-4">
				<label class="block">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Root domain <span class="text-red-400">*</span>
					</span>
					<input
						type="text"
						bind:value={rootInput}
						required
						autocomplete="off"
						spellcheck="false"
						placeholder="theirbusiness.com"
						disabled={submitting}
						class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
					/>
					<span class="mt-1.5 block text-[11px] text-slate-400">
						The contractor's bare domain — no prefix. Pasting a full URL is fine.
					</span>
				</label>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label class="block">
						<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
							Sending prefix <span class="text-red-400">*</span>
						</span>
						<input
							type="text"
							bind:value={sendingPrefixInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="contact"
							disabled={submitting}
							class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
						/>
					</label>
					<label class="block">
						<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
							Receiving prefix <span class="text-red-400">*</span>
						</span>
						<input
							type="text"
							bind:value={inboundPrefixInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="replies"
							disabled={submitting}
							class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
						/>
					</label>
				</div>

				<!-- Live preview — the agency sees both derived domains before saving. -->
				{#if previewSending && previewInbound}
					<div class="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 space-y-2">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span class="text-[11px] font-medium text-slate-400">Emails send from:</span>
							<code class="font-mono text-xs text-emerald-300">{previewSending}</code>
						</div>
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span class="text-[11px] font-medium text-slate-400">Replies go to:</span>
							<code class="font-mono text-xs text-emerald-300">{previewInbound}</code>
						</div>
						{#if prefixesCollide}
							<p class="text-[11px] font-medium text-red-300">
								Sending and receiving prefixes must be different.
							</p>
						{/if}
					</div>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit}
					class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-red-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-red-900/40 hover:from-red-500 hover:to-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
				>
					{#if submitting}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="animate-spin"
							aria-hidden="true"
						>
							<path d="M21 12a9 9 0 1 1-6.219-8.56" />
						</svg>
						Registering…
					{:else}
						Register domain
					{/if}
				</button>
			</form>
		{:else}
			<!-- Configured: domain header + Resend-style DNS records table -->
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0">
					<div class="flex items-center gap-2.5">
						<span
							class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<rect x="2" y="4" width="20" height="16" rx="2" />
								<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
							</svg>
						</span>
						<p class="truncate font-mono text-sm font-medium text-white">{row.domain}</p>
					</div>
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						<!-- Sending status — from Brevo's domain verification. -->
						<span
							class={isReady
								? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300'
								: 'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300'}
						>
							<span class="size-1.5 rounded-full bg-current"></span>
							Sending {isReady ? 'ready' : 'pending'}
						</span>
						<!-- Receiving status — from live inbound MX lookup. -->
						<span
							class={inboundReady
								? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300'
								: 'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300'}
						>
							<span class="size-1.5 rounded-full bg-current"></span>
							Receiving {inboundReady ? 'ready' : 'pending'}
						</span>
					</div>
					{#if shouldPoll}
						<p class="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
							<span class="size-1.5 animate-pulse rounded-full bg-emerald-400"></span>
							Auto-checking every 15s — status updates on its own as DNS propagates.
						</p>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						onclick={runVerify}
						disabled={verifying || polling}
						class="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						{#if verifying}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="animate-spin"
								aria-hidden="true"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
							Checking…
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
								<polyline points="21 3 21 9 15 9" />
							</svg>
							Verify DNS records
						{/if}
					</button>
					<button
						type="button"
						onclick={() => (confirmRemoveOpen = true)}
						disabled={removing}
						class="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-slate-400 hover:border-red-500/40 hover:text-red-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
					>
						{removing ? 'Removing…' : 'Remove'}
					</button>
				</div>
			</div>

			{#if !isReady}
				<p class="mt-4 text-sm text-slate-300">
					Add these records at the contractor's DNS provider, then click <span
						class="font-semibold text-white">Verify DNS records</span
					>. DNS changes can take a few minutes up to 48 hours to propagate — "Setup pending" is
					normal until then.
				</p>
			{/if}

			{#if sendingRecords.length > 0}
				<div class="mt-5">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sending</p>
					<p class="mt-0.5 text-xs text-slate-500">
						Authorizes this domain to send email. Verified automatically by Brevo.
					</p>
					{@render dnsTable(sendingRecords, false)}
				</div>
			{/if}

			{#if receivingRecords.length > 0}
				<div class="mt-5">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Receiving (replies)
					</p>
					<p class="mt-0.5 text-xs text-slate-500">
						Routes customer replies back into the inbox. Add these records on the receiving
						subdomain, then click <span class="font-semibold text-slate-300"
							>Verify DNS records</span
						>.
					</p>
					{@render dnsTable(receivingRecords, true)}
				</div>
			{/if}

			{#if inboundPath}
				<div class="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
						Inbound webhook path
					</p>
					<div class="mt-1.5 flex items-center gap-2">
						<code class="truncate font-mono text-xs text-slate-300">{inboundPath}</code>
						{@render copyButton(inboundPath ?? '', 'inbound-path')}
					</div>
				</div>
			{/if}
		{/if}

		{#if localError}
			<div
				role="alert"
				class="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
			>
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
