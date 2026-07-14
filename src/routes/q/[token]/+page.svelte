<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Dialog from '$lib/components/ui/dialog';
	import QuoteDocumentView from '$lib/components/quotes/QuoteDocumentView.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { page } from '$app/state';
	import type { PublicQuoteView } from '$lib/types/quotes';
	import { resolveBrandTheme } from '$lib/utils/brandColor';

	let { data }: { data: { quote: PublicQuoteView | null } } = $props();

	// Per-contractor branding: brand color (with readable-contrast fallback to app green)
	// is exposed as CSS variables on the page wrapper so the CTA + accents pick it up.
	const brand = $derived(resolveBrandTheme(data.quote?.org_primary_color ?? null));
	const orgInitials = $derived(
		(data.quote?.org_name ?? '?')
			.split(/\s+/)
			.filter(Boolean)
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const token = $derived(page.params.token);
	// Once a quote is accepted, always render the read-only accepted view — regardless of
	// whether the deposit has been paid. The accepted view's `owesDeposit` block handles the
	// "deposit still owed" case, so the client returning to the link sees their accepted quote
	// (and a pay-deposit prompt if applicable), never the Accept/Decline actions again.
	const initialAction = $derived<'accepted' | 'declined' | 'changes_requested' | null>(
		data.quote?.status === 'accepted' ? 'accepted' : null
	);
	let action = $state<'accepted' | 'declined' | 'changes_requested' | null>(null);
	$effect(() => {
		if (action === null && initialAction !== null) action = initialAction;
	});

	let busy = $state<'accept' | 'decline' | 'changes' | 'deposit' | null>(null);
	let confirmingDecline = $state(false);
	let declineReason = $state<'price' | 'competitor' | 'timing' | 'scope' | 'other' | null>(null);
	let declineNote = $state('');
	let declineError = $state<string | null>(null);
	let changesOpen = $state(false);
	let changesMessage = $state('');
	let changesError = $state<string | null>(null);
	let depositError = $state<string | null>(null);
	let isDesktop = $state(false);

	// Signature step state
	let signingStep = $state(false);
	let signerName = $state('');
	let signerNameError = $state<string | null>(null);
	let confirmedSignerName = $state('');

	// Optional add-on selections live here (the parent owns them) so the accept call can send the
	// chosen ids; QuoteDocumentView renders the checkboxes and writes back through the binding.
	let selectedOptional = $state<Record<string, boolean>>({});
	const selectedOptionalIds = $derived(
		Object.keys(selectedOptional).filter((k) => selectedOptional[k])
	);
	// Good-Better-Best: the tier the customer selected on a tiered quote (null on a simple
	// quote). QuoteDocumentView pre-selects the recommended tier and writes back through the bind.
	let selectedPackageId = $state<string | null>(null);
	// Name of the accepted tier for the read-only confirmation view.
	const acceptedPkgName = $derived(
		data.quote?.packages?.find((p) => p.id === data.quote?.accepted_package_id)?.name ?? null
	);

	const owesDeposit = $derived(
		data.quote != null &&
			data.quote.deposit_required &&
			data.quote.deposit_paid_amount === 0 &&
			(data.quote.status === 'accepted' || action === 'accepted')
	);
	const depositPaid = $derived(
		data.quote != null && data.quote.deposit_required && data.quote.deposit_paid_amount > 0
	);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(min-width: 768px)');
		const update = () => (isDesktop = mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	const alreadyChangesRequested = $derived(data.quote?.status === 'changes_requested');
	const canTakeAction = $derived(data.quote && !alreadyChangesRequested && action === null);

	const declineReasons = [
		{ value: 'price', label: 'Price is too high' },
		{ value: 'competitor', label: 'Going with someone else' },
		{ value: 'timing', label: "Timing isn't right" },
		{ value: 'scope', label: 'Scope changed' },
		{ value: 'other', label: 'Other' }
	] as const;

	function startAccept() {
		signerName = '';
		signerNameError = null;
		signingStep = true;
	}

	function cancelSign() {
		signingStep = false;
		signerName = '';
		signerNameError = null;
	}

	async function submitAccept() {
		const name = signerName.trim();
		if (!name || name.length < 2) {
			signerNameError = 'Please enter your full name to sign.';
			return;
		}
		signerNameError = null;
		busy = 'accept';
		try {
			const res = await fetch(`/q/${token}/accept`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					signer_name: name,
					selected_optional_ids: selectedOptionalIds,
					selected_package_id: selectedPackageId
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				signerNameError = body.error ?? 'Could not submit. Please try again.';
				return;
			}
			confirmedSignerName = name;
			signingStep = false;
			action = (body.data?.status as 'accepted') ?? null;
		} finally {
			busy = null;
		}
	}

	async function submitDecline() {
		if (!declineReason) {
			declineError = 'Please choose a reason.';
			return;
		}
		busy = 'decline';
		declineError = null;
		try {
			const res = await fetch(`/q/${token}/decline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					reason: declineReason,
					note: declineNote.trim() || undefined
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				declineError = body.error ?? 'Could not submit. Please try again.';
				return;
			}
			action = (body.data?.status as 'declined') ?? null;
		} catch {
			declineError = 'Network error. Please try again.';
		} finally {
			busy = null;
		}
	}

	function openChanges() {
		changesMessage = '';
		changesError = null;
		changesOpen = true;
	}

	async function payDeposit() {
		busy = 'deposit';
		depositError = null;
		try {
			const res = await fetch(`/q/${token}/pay-deposit`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.data?.url) {
				depositError = body.error ?? 'Could not start deposit payment. Please try again.';
				return;
			}
			window.location.href = body.data.url as string;
		} catch {
			depositError = 'Network error. Please try again.';
		} finally {
			busy = null;
		}
	}

	async function submitChanges() {
		const trimmed = changesMessage.trim();
		if (!trimmed) {
			changesError = 'Please tell us what you would like to change.';
			return;
		}
		busy = 'changes';
		changesError = null;
		try {
			const res = await fetch(`/q/${token}/request-changes`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: trimmed })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				changesError = body.error ?? 'Could not submit. Please try again.';
				return;
			}
			action = 'changes_requested';
			changesOpen = false;
		} catch {
			changesError = 'Network error. Please try again.';
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title
		>{data.quote
			? `${data.quote.org_name} — Quote ${data.quote.quote_number_display}`
			: 'Quote'}</title
	>
</svelte:head>

{#snippet brandHeader(quote: PublicQuoteView)}
	<div class="pub-quote__brand">
		{#if quote.org_logo_url}
			<img src={quote.org_logo_url} alt={quote.org_name} class="pub-quote__logo" />
		{:else}
			<div class="pub-quote__brand-mark">{orgInitials}</div>
		{/if}
		<div class="pub-quote__brand-text">
			<p class="pub-quote__brand-name">{quote.org_name}</p>
			{#if quote.org_tagline}
				<p class="pub-quote__brand-tagline">{quote.org_tagline}</p>
			{/if}
		</div>
	</div>
{/snippet}

<div class="pub-quote" style="--brand: {brand.accent}; --brand-fg: {brand.accentFg};">
	<div class="pub-quote__shell">
		{#if !data.quote}
			<div class="pub-quote__card pub-quote__card--center">
				<h1 class="pub-quote__title">Quote no longer available</h1>
				<p class="pub-quote__muted">
					This link is invalid or has expired. Please reach out to the sender for a new link.
				</p>
			</div>
		{:else if action === 'accepted'}
			<div class="pub-quote__stack">
				{@render brandHeader(data.quote)}
				<!-- Accepted confirmation card -->
				<div class="pub-quote__card pub-quote__card--center pub-quote__card--accepted">
					<div class="pub-quote__status-icon pub-quote__status-icon--success">
						<i class="ri-check-line" aria-hidden="true"></i>
					</div>
					<h1 class="pub-quote__title pub-quote__title--lg">Quote accepted!</h1>
					<p class="pub-quote__muted">
						{data.quote.org_name} has been notified and will be in touch shortly.
					</p>
					{#if acceptedPkgName}
						<div class="pub-quote__accepted-pkg">
							<i class="ri-price-tag-3-line" aria-hidden="true"></i>
							<span>You selected the <strong>{acceptedPkgName}</strong> package</span>
						</div>
					{/if}
					{#if confirmedSignerName}
						<div class="pub-quote__signed">
							<i class="ri-quill-pen-line" aria-hidden="true"></i>
							<p>Signed by <span class="pub-quote__signed-name">{confirmedSignerName}</span></p>
						</div>
					{/if}
				</div>

				{#if owesDeposit && data.quote.deposit_amount}
					<div class="pub-quote__notice pub-quote__notice--warning">
						<div class="pub-quote__notice-head">
							<i class="ri-bank-card-line" aria-hidden="true"></i>
							<p class="pub-quote__notice-title">Deposit owed</p>
						</div>
						<p class="pub-quote__notice-text">
							{data.quote.deposit_type === 'percent' && data.quote.deposit_percent
								? `A ${Number(data.quote.deposit_percent).toFixed(0)}% deposit of`
								: 'A deposit of'}
							<span class="pub-quote__strong">{formatCurrency(data.quote.deposit_amount)}</span> is requested
							to start. You can pay it now or later.
						</p>
						{#if data.quote.deposit_payment_available}
							<Button
								class="pub-quote__cta pub-quote__cta--block"
								loadingLabel="Redirecting…"
								successLabel="Redirecting"
								loading={busy === 'deposit'}
								disabled={busy !== null && busy !== 'deposit'}
								onclick={payDeposit}
							>
								Pay deposit
								{#snippet icon()}<i class="ri-bank-card-line" aria-hidden="true"></i>{/snippet}
							</Button>
						{:else}
							<p class="pub-quote__notice-hint">
								{data.quote.org_name} will contact you with payment instructions.
							</p>
						{/if}
						{#if depositError}<p class="pub-quote__error">{depositError}</p>{/if}
					</div>
				{:else if depositPaid && data.quote.deposit_amount}
					<div class="pub-quote__notice pub-quote__notice--success">
						<div class="pub-quote__notice-head">
							<i class="ri-check-line" aria-hidden="true"></i>
							<p class="pub-quote__notice-title">Deposit received</p>
						</div>
						<p class="pub-quote__notice-text">
							{formatCurrency(data.quote.deposit_amount)} received{#if data.quote.deposit_paid_at}
								&nbsp;on {new Date(data.quote.deposit_paid_at).toLocaleDateString('en-US')}{/if}.
						</p>
					</div>
				{/if}
			</div>
		{:else if action === 'declined'}
			<div class="pub-quote__stack">
				{@render brandHeader(data.quote)}
				<div class="pub-quote__card pub-quote__card--center">
					<div class="pub-quote__status-icon pub-quote__status-icon--muted">
						<i class="ri-close-line" aria-hidden="true"></i>
					</div>
					<h1 class="pub-quote__title">Quote declined</h1>
					<p class="pub-quote__muted">
						Thanks for letting us know. {data.quote.org_name} has been notified.
					</p>
				</div>
			</div>
		{:else if action === 'changes_requested'}
			<div class="pub-quote__stack">
				{@render brandHeader(data.quote)}
				<div class="pub-quote__card pub-quote__card--center">
					<div class="pub-quote__status-icon pub-quote__status-icon--amber">
						<i class="ri-chat-1-line" aria-hidden="true"></i>
					</div>
					<h1 class="pub-quote__title">Request received</h1>
					<p class="pub-quote__muted">
						Thanks! {data.quote.org_name} will review your request and send an updated quote shortly.
					</p>
				</div>
			</div>
		{:else}
			<QuoteDocumentView quote={data.quote} bind:selectedOptional bind:selectedPackageId>
				{#snippet actions()}
					{#if canTakeAction}
						<div class="pub-quote__actions">
							{#if signingStep}
								<!-- E-signature card -->
								<div class="pub-quote__sign">
									<div class="pub-quote__sign-head">
										<div class="pub-quote__sign-icon">
											<i class="ri-quill-pen-line" aria-hidden="true"></i>
										</div>
										<div>
											<p class="pub-quote__sign-title">Sign to accept this quote</p>
											<p class="pub-quote__sign-sub">Your signature is legally binding</p>
										</div>
									</div>

									<div class="pub-quote__sign-body">
										<div class="field">
											<label for="signer-name" class="field__label field__label--required">
												Full name
											</label>
											<input
												id="signer-name"
												class="field__input"
												bind:value={signerName}
												placeholder="e.g. Jane Smith"
												autocomplete="name"
												disabled={busy === 'accept'}
												oninput={() => (signerNameError = null)}
											/>
											{#if signerNameError}<p class="field__error">{signerNameError}</p>{/if}
										</div>

										<p class="pub-quote__legal">
											By entering your name above and clicking <strong>"Sign &amp; Accept"</strong>,
											you confirm that you have read and agree to the terms and pricing in this
											quote from <span class="pub-quote__legal-org">{data.quote?.org_name}</span>.
										</p>

										<div class="pub-quote__btn-row">
											<Button
												type="button"
												variant="outline"
												disabled={busy === 'accept'}
												onclick={cancelSign}
											>
												Cancel
											</Button>
											<Button
												class="pub-quote__cta"
												loadingLabel="Signing…"
												successLabel="Signed!"
												loading={busy === 'accept'}
												disabled={busy !== null && busy !== 'accept'}
												onclick={submitAccept}
											>
												Sign & Accept
												{#snippet icon()}<i class="ri-quill-pen-line" aria-hidden="true"
													></i>{/snippet}
											</Button>
										</div>
									</div>
								</div>
							{:else}
								<Button
									class="pub-quote__cta pub-quote__cta--block pub-quote__cta--lg"
									loadingLabel="Accepting…"
									successLabel="Accepted"
									disabled={busy !== null}
									onclick={startAccept}
								>
									Accept quote
									{#snippet icon()}<i class="ri-check-line" aria-hidden="true"></i>{/snippet}
								</Button>
							{/if}

							{#if !signingStep}
								<Button
									type="button"
									variant="outline"
									class="btn--full"
									disabled={busy !== null}
									onclick={openChanges}
								>
									<i class="ri-chat-1-line" aria-hidden="true"></i>Request changes
								</Button>
								{#if !confirmingDecline}
									<Button
										type="button"
										variant="ghost"
										class="btn--full pub-quote__decline-btn"
										disabled={busy !== null}
										onclick={() => (confirmingDecline = true)}
									>
										Decline
									</Button>
								{:else}
									<div class="pub-quote__decline">
										<p class="pub-quote__decline-prompt">Why are you declining?</p>
										<div class="pub-quote__decline-reasons">
											{#each declineReasons as r (r.value)}
												<label class="pub-quote__reason">
													<input
														type="radio"
														name="decline-reason"
														value={r.value}
														bind:group={declineReason}
														disabled={busy !== null}
														class="pub-quote__reason-radio"
													/>
													<span>{r.label}</span>
												</label>
											{/each}
										</div>
										{#if declineReason === 'other'}
											<textarea
												class="field__textarea pub-quote__decline-note"
												rows={3}
												maxlength={2000}
												placeholder="Tell us a bit more (optional)"
												bind:value={declineNote}
												disabled={busy !== null}
											></textarea>
										{/if}
										{#if declineError}<p class="pub-quote__error">{declineError}</p>{/if}
										<div class="pub-quote__btn-row">
											<Button
												type="button"
												variant="outline"
												disabled={busy !== null}
												onclick={() => {
													confirmingDecline = false;
													declineError = null;
												}}
											>
												Cancel
											</Button>
											<Button
												variant="destructive"
												loadingLabel="Declining…"
												successLabel="Declined"
												loading={busy === 'decline'}
												disabled={(busy !== null && busy !== 'decline') || !declineReason}
												onclick={submitDecline}
											>
												Confirm decline
											</Button>
										</div>
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				{/snippet}
			</QuoteDocumentView>
		{/if}
	</div>
</div>

{#snippet changesForm()}
	<div class="pub-quote__changes">
		<p class="pub-quote__muted">
			Tell {data.quote?.org_name ?? 'us'} what you'd like changed. They'll send an updated quote.
		</p>
		<textarea
			class="field__textarea"
			rows={5}
			maxlength={2000}
			placeholder="e.g. Can you remove the garage portion? Or phase this differently?"
			bind:value={changesMessage}
			disabled={busy === 'changes'}
		></textarea>
		{#if changesError}<p class="pub-quote__error">{changesError}</p>{/if}
		<div class="pub-quote__btn-row">
			<Button
				type="button"
				variant="outline"
				disabled={busy === 'changes'}
				onclick={() => (changesOpen = false)}
			>
				Cancel
			</Button>
			<Button
				loadingLabel="Sending…"
				successLabel="Sent"
				loading={busy === 'changes'}
				onclick={submitChanges}
			>
				Send request
				{#snippet icon()}<i class="ri-chat-1-line" aria-hidden="true"></i>{/snippet}
			</Button>
		</div>
	</div>
{/snippet}

{#if isDesktop}
	<Dialog.Root bind:open={changesOpen}>
		<Dialog.Content class="pub-quote-changes-dialog">
			<div class="dialog-content__header">
				<h2 class="dialog-content__title">Request changes</h2>
			</div>
			{@render changesForm()}
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Sheet.Root bind:open={changesOpen}>
		<Sheet.Content side="bottom" class="pub-quote-changes-sheet">
			<Sheet.Header>
				<Sheet.Title>Request changes</Sheet.Title>
			</Sheet.Header>
			<div class="pub-quote__changes-wrap">
				{@render changesForm()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
