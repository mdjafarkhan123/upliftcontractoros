<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Dialog from '$lib/components/ui/dialog';
	import QuoteDocumentView from '$lib/components/quotes/QuoteDocumentView.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { Check, CreditCard, MessageSquare, PenLine, X } from '@lucide/svelte';
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
				body: JSON.stringify({ signer_name: name, selected_optional_ids: selectedOptionalIds })
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
	<div class="flex items-center gap-3">
		{#if quote.org_logo_url}
			<img
				src={quote.org_logo_url}
				alt={quote.org_name}
				class="h-12 w-auto max-w-[150px] shrink-0 object-contain"
			/>
		{:else}
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold"
				style="background-color: var(--brand); color: var(--brand-fg);"
			>
				{orgInitials}
			</div>
		{/if}
		<div class="min-w-0">
			<p class="truncate text-base font-semibold leading-tight text-foreground">
				{quote.org_name}
			</p>
			{#if quote.org_tagline}
				<p class="truncate text-xs text-muted-foreground">{quote.org_tagline}</p>
			{/if}
		</div>
	</div>
{/snippet}

<div
	class="min-h-screen bg-background px-4 py-8 md:py-16"
	style="--brand: {brand.accent}; --brand-fg: {brand.accentFg};"
>
	<div class="mx-auto max-w-xl">
		{#if !data.quote}
			<div class="rounded-2xl border border-border bg-card p-8 text-center">
				<h1 class="text-lg font-semibold">Quote no longer available</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					This link is invalid or has expired. Please reach out to the sender for a new link.
				</p>
			</div>
		{:else if action === 'accepted'}
			<div class="space-y-4">
				{@render brandHeader(data.quote)}
				<!-- Accepted confirmation card -->
				<div class="rounded-2xl border border-emerald-500/30 bg-card p-8 text-center">
					<div
						class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15"
					>
						<Check class="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
					</div>
					<h1 class="mt-4 text-xl font-bold tracking-tight">Quote accepted!</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{data.quote.org_name} has been notified and will be in touch shortly.
					</p>
					{#if confirmedSignerName}
						<div
							class="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3"
						>
							<PenLine class="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
							<p class="text-sm text-emerald-800 dark:text-emerald-300">
								Signed by <span class="font-semibold">{confirmedSignerName}</span>
							</p>
						</div>
					{/if}
				</div>

				{#if owesDeposit && data.quote.deposit_amount}
					<div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
						<div class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
							<CreditCard class="h-5 w-5" />
							<p class="text-sm font-semibold">Deposit owed</p>
						</div>
						<p class="mt-2 text-sm text-amber-800/90 dark:text-amber-200/80">
							{data.quote.deposit_type === 'percent' && data.quote.deposit_percent
								? `A ${Number(data.quote.deposit_percent).toFixed(0)}% deposit of`
								: 'A deposit of'}
							<span class="font-semibold">{formatCurrency(data.quote.deposit_amount)}</span> is requested
							to start. You can pay it now or later.
						</p>
						{#if data.quote.deposit_payment_available}
							<JetEngineButton
								class="mt-4 min-h-[52px] w-full text-base"
								label="Pay deposit"
								loadingLabel="Redirecting…"
								successLabel="Redirecting"
								state={busy === 'deposit' ? 'loading' : 'idle'}
								disabled={busy !== null && busy !== 'deposit'}
								onclick={payDeposit}
							>
								{#snippet icon()}<CreditCard class="h-5 w-5" />{/snippet}
							</JetEngineButton>
						{:else}
							<p class="mt-3 text-xs text-amber-700/80 dark:text-amber-300/70">
								{data.quote.org_name} will contact you with payment instructions.
							</p>
						{/if}
						{#if depositError}
							<p class="mt-2 text-xs text-destructive">{depositError}</p>
						{/if}
					</div>
				{:else if depositPaid && data.quote.deposit_amount}
					<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
						<div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
							<Check class="h-5 w-5" />
							<p class="text-sm font-semibold">Deposit received</p>
						</div>
						<p class="mt-2 text-sm text-emerald-800/90 dark:text-emerald-200/80">
							{formatCurrency(data.quote.deposit_amount)} received{#if data.quote.deposit_paid_at}
								&nbsp;on {new Date(data.quote.deposit_paid_at).toLocaleDateString('en-US')}{/if}.
						</p>
					</div>
				{/if}
			</div>
		{:else if action === 'declined'}
			<div class="space-y-4">
				{@render brandHeader(data.quote)}
				<div class="rounded-2xl border border-border bg-card p-8 text-center">
					<div
						class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
					>
						<X class="h-6 w-6" />
					</div>
					<h1 class="mt-4 text-lg font-semibold">Quote declined</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						Thanks for letting us know. {data.quote.org_name} has been notified.
					</p>
				</div>
			</div>
		{:else if action === 'changes_requested'}
			<div class="space-y-4">
				{@render brandHeader(data.quote)}
				<div class="rounded-2xl border border-border bg-card p-8 text-center">
					<div
						class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
					>
						<MessageSquare class="h-6 w-6" />
					</div>
					<h1 class="mt-4 text-lg font-semibold">Request received</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						Thanks! {data.quote.org_name} will review your request and send an updated quote shortly.
					</p>
				</div>
			</div>
		{:else}
			<QuoteDocumentView quote={data.quote} bind:selectedOptional>
				{#snippet actions()}
					{#if canTakeAction}
						<div class="space-y-2">
							{#if signingStep}
								<!-- E-signature card -->
								<div class="rounded-2xl border border-primary/25 bg-card p-5 shadow-sm">
									<!-- Header -->
									<div class="mb-4 flex items-center gap-3">
										<div
											class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10"
										>
											<PenLine class="h-4.5 w-4.5 text-primary" />
										</div>
										<div>
											<p class="text-sm font-semibold text-foreground">Sign to accept this quote</p>
											<p class="text-xs text-muted-foreground">Your signature is legally binding</p>
										</div>
									</div>

									<div class="space-y-4">
										<div class="space-y-1.5">
											<Label for="signer-name" class="text-sm font-medium">
												Full name <span class="text-destructive">*</span>
											</Label>
											<Input
												id="signer-name"
												bind:value={signerName}
												placeholder="e.g. Jane Smith"
												autocomplete="name"
												disabled={busy === 'accept'}
												class="h-11 text-base"
												oninput={() => (signerNameError = null)}
											/>
											{#if signerNameError}
												<p class="text-xs text-destructive">{signerNameError}</p>
											{/if}
										</div>

										<p
											class="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
										>
											By entering your name above and clicking <strong
												class="font-medium text-foreground">"Sign & Accept"</strong
											>, you confirm that you have read and agree to the terms and pricing in this
											quote from
											<span class="font-medium text-foreground">{data.quote?.org_name}</span>.
										</p>

										<div class="grid grid-cols-2 gap-2">
											<Button
												variant="outline"
												class="min-h-[44px]"
												onclick={cancelSign}
												disabled={busy === 'accept'}
											>
												Cancel
											</Button>
											<JetEngineButton
												class="bg-[color:var(--brand)] text-[color:var(--brand-fg)] hover:bg-[color:var(--brand)] hover:brightness-95"
												label="Sign & Accept"
												loadingLabel="Signing…"
												successLabel="Signed!"
												state={busy === 'accept' ? 'loading' : 'idle'}
												disabled={busy !== null && busy !== 'accept'}
												onclick={submitAccept}
											>
												{#snippet icon()}<PenLine class="h-4 w-4" />{/snippet}
											</JetEngineButton>
										</div>
									</div>
								</div>
							{:else}
								<JetEngineButton
									class="min-h-[52px] w-full bg-[color:var(--brand)] text-base text-[color:var(--brand-fg)] shadow-card transition-all hover:bg-[color:var(--brand)] hover:brightness-95"
									label="Accept quote"
									loadingLabel="Accepting…"
									successLabel="Accepted"
									state="idle"
									disabled={busy !== null}
									onclick={startAccept}
								>
									{#snippet icon()}<Check class="h-5 w-5" />{/snippet}
								</JetEngineButton>
							{/if}

							{#if !signingStep}
								<Button
									variant="outline"
									class="min-h-[44px] w-full"
									onclick={openChanges}
									disabled={busy !== null}
								>
									<MessageSquare class="mr-2 h-4 w-4" />Request changes
								</Button>
								{#if !confirmingDecline}
									<Button
										variant="ghost"
										class="min-h-[44px] w-full text-muted-foreground"
										onclick={() => (confirmingDecline = true)}
										disabled={busy !== null}
									>
										Decline
									</Button>
								{:else}
									<div class="rounded-xl border border-border bg-card p-4 text-sm">
										<p class="font-medium">Why are you declining?</p>
										<div class="mt-3 space-y-2">
											{#each declineReasons as r (r.value)}
												<label
													class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
												>
													<input
														type="radio"
														name="decline-reason"
														value={r.value}
														bind:group={declineReason}
														disabled={busy !== null}
														class="h-4 w-4 accent-primary"
													/>
													<span>{r.label}</span>
												</label>
											{/each}
										</div>
										{#if declineReason === 'other'}
											<Textarea
												rows={3}
												maxlength={2000}
												placeholder="Tell us a bit more (optional)"
												bind:value={declineNote}
												disabled={busy !== null}
												class="mt-3"
											/>
										{/if}
										{#if declineError}
											<p class="mt-2 text-xs text-destructive">{declineError}</p>
										{/if}
										<div class="mt-3 grid grid-cols-2 gap-2">
											<Button
												variant="outline"
												class="min-h-[44px]"
												onclick={() => {
													confirmingDecline = false;
													declineError = null;
												}}
												disabled={busy !== null}
											>
												Cancel
											</Button>
											<JetEngineButton
												variant="destructive"
												label="Confirm decline"
												loadingLabel="Declining…"
												successLabel="Declined"
												state={busy === 'decline' ? 'loading' : 'idle'}
												disabled={(busy !== null && busy !== 'decline') || !declineReason}
												onclick={submitDecline}
											/>
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
	<div class="space-y-3">
		<p class="text-sm text-muted-foreground">
			Tell {data.quote?.org_name ?? 'us'} what you'd like changed. They'll send an updated quote.
		</p>
		<Textarea
			rows={5}
			maxlength={2000}
			placeholder="e.g. Can you remove the garage portion? Or phase this differently?"
			bind:value={changesMessage}
			disabled={busy === 'changes'}
		/>
		{#if changesError}
			<p class="text-xs text-destructive">{changesError}</p>
		{/if}
		<div class="grid grid-cols-2 gap-2 pt-1">
			<Button
				variant="outline"
				class="min-h-[44px]"
				onclick={() => (changesOpen = false)}
				disabled={busy === 'changes'}
			>
				Cancel
			</Button>
			<JetEngineButton
				label="Send request"
				loadingLabel="Sending…"
				successLabel="Sent"
				state={busy === 'changes' ? 'loading' : 'idle'}
				onclick={submitChanges}
			>
				{#snippet icon()}<MessageSquare class="h-4 w-4" />{/snippet}
			</JetEngineButton>
		</div>
	</div>
{/snippet}

{#if isDesktop}
	<Dialog.Root bind:open={changesOpen}>
		<Dialog.Content class="max-w-md">
			<Dialog.Header>
				<Dialog.Title>Request changes</Dialog.Title>
			</Dialog.Header>
			{@render changesForm()}
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Sheet.Root bind:open={changesOpen}>
		<Sheet.Content side="bottom" class="pb-6">
			<Sheet.Header>
				<Sheet.Title>Request changes</Sheet.Title>
			</Sheet.Header>
			<div class="mt-3">
				{@render changesForm()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
