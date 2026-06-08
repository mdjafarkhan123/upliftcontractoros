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
		class="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-700/60 hover:text-white"
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

<section
	class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30"
>
	<header class="flex items-center gap-3 border-b border-slate-800/80 px-5 py-4">
		<span
			class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300"
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
			<h2 class="text-base font-semibold text-white">Platform email domain</h2>
			<p class="mt-1 text-sm text-slate-300">
				The dedicated subdomain all system &amp; PO mail sends from (carrier alerts, password
				resets, billing). Add the DNS records to your own domain provider, then verify.
			</p>
		</div>
	</header>

	<div class="px-5 py-5">
		{#if loadStatus === 'loading' && !domainState}
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
		{:else if !domainState?.domain}
			<!-- Empty: register the platform sending domain -->
			<form onsubmit={submitDomain} class="space-y-4">
				<label class="block">
					<span class="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
						Root domain <span class="text-red-400">*</span>
					</span>
					<input
						type="text"
						bind:value={rootInput}
						required
						autocomplete="off"
						spellcheck="false"
						placeholder="yourcompany.com"
						disabled={submitting}
						class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
					/>
					<span class="mt-1.5 block text-[11px] text-slate-400">
						Your bare domain — no prefix. Pasting a full URL is fine.
					</span>
				</label>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<label class="block">
						<span class="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
							Sending prefix <span class="text-red-400">*</span>
						</span>
						<input
							type="text"
							bind:value={sendingPrefixInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="notifications"
							disabled={submitting}
							class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
						/>
					</label>
					<label class="block">
						<span class="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
							From (local part) <span class="text-red-400">*</span>
						</span>
						<input
							type="text"
							bind:value={fromLocalInput}
							required
							autocomplete="off"
							spellcheck="false"
							placeholder="noreply"
							disabled={submitting}
							class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
						/>
					</label>
					<label class="block">
						<span class="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
							Sender name <span class="text-red-400">*</span>
						</span>
						<input
							type="text"
							bind:value={fromNameInput}
							required
							autocomplete="off"
							placeholder="Uplift Contractor"
							disabled={submitting}
							class="mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
						/>
					</label>
				</div>

				{#if previewFrom}
					<div class="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span class="text-[11px] font-medium text-slate-400">System mail sends from:</span>
							<code class="font-mono text-xs text-sky-300">{previewFrom}</code>
						</div>
					</div>
				{/if}

				<button
					type="submit"
					disabled={!canSubmit}
					class="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-b from-sky-500 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-900/40 transition-all hover:from-sky-500 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
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
			<!-- Configured: domain header + DNS records table -->
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
						<div class="min-w-0">
							<p class="truncate font-mono text-sm font-medium text-white">{domainState.domain}</p>
							{#if domainState.from_address}
								<p class="truncate font-mono text-xs text-slate-400">{domainState.from_address}</p>
							{/if}
						</div>
					</div>
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						<span
							class={isReady
								? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-300 uppercase'
								: 'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-amber-300 uppercase'}
						>
							<span class="size-1.5 rounded-full bg-current"></span>
							Sending {isReady ? 'ready' : 'pending'}
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
						class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
						class="cursor-pointer rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-slate-400 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{removing ? 'Removing…' : 'Remove'}
					</button>
				</div>
			</div>

			{#if !isReady}
				<p class="mt-4 text-sm text-slate-300">
					Add these records at your DNS provider, then click <span class="font-semibold text-white"
						>Verify DNS records</span
					>. DNS changes can take a few minutes up to 48 hours to propagate — "pending" is normal
					until then.
				</p>
			{/if}

			{#if records.length > 0}
				<div class="mt-5">
					<p class="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Sending</p>
					<p class="mt-0.5 text-xs text-slate-500">
						Authorizes this domain to send email. Verified automatically by Brevo.
					</p>
					<div class="mt-3 overflow-hidden rounded-xl border border-slate-800">
						<div
							class="hidden items-center gap-x-4 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5 sm:grid sm:grid-cols-[72px_minmax(0,1.1fr)_minmax(0,2fr)_112px]"
						>
							<span class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
								>Type</span
							>
							<span class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
								>Host / Name</span
							>
							<span class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
								>Value</span
							>
							<span class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
								>Status</span
							>
						</div>

						<div class="divide-y divide-slate-800">
							{#each records as rec, i (recordKey(rec, i))}
								{@const verified = rec.status === true || isReady}
								<div
									class="grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 py-3.5 sm:grid-cols-[72px_minmax(0,1.1fr)_minmax(0,2fr)_112px] sm:items-center sm:gap-y-1"
								>
									<p class="text-xs font-semibold text-slate-200 sm:hidden">{rec.label}</p>

									<div class="flex items-center gap-2">
										<span
											class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase sm:hidden"
											>Type</span
										>
										<span
											class="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300"
										>
											{rec.type}
										</span>
									</div>

									<div class="flex min-w-0 items-center gap-2">
										<span
											class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase sm:hidden"
											>Host</span
										>
										<code class="truncate font-mono text-xs text-slate-200">{rec.host || '@'}</code>
										{@render copyButton(rec.host, `host-${recordKey(rec, i)}`)}
									</div>

									<div class="flex min-w-0 items-center gap-2">
										<span
											class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase sm:hidden"
											>Value</span
										>
										<code class="truncate font-mono text-xs text-slate-200">{rec.value}</code>
										{@render copyButton(rec.value, `value-${recordKey(rec, i)}`)}
									</div>

									<div class="flex items-center gap-2">
										<span
											class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase sm:hidden"
											>Status</span
										>
										{#if verified}
											<span
												class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300"
											>
												<span class="size-1.5 rounded-full bg-emerald-400"></span>
												Verified
											</span>
										{:else}
											<span class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
												<span class="size-1.5 rounded-full bg-amber-400"></span>
												Pending
											</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
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
	title="Remove platform email domain?"
	description={domainState?.domain
		? `This deletes ${domainState.domain} from Brevo and clears its setup. System mail falls back to the SYSTEM_FROM_EMAIL env value until you set a domain up again.`
		: 'This deletes the domain from Brevo and clears its setup.'}
	confirmLabel="Remove domain"
	variant="destructive"
	loading={removing}
	onConfirm={runRemove}
/>
