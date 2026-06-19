<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Dialog from '$lib/components/ui/dialog';
	import { formatCurrency } from '$lib/utils/format';
	import { Check, CreditCard, MessageSquare, X } from '@lucide/svelte';
	import { page } from '$app/state';
	import type { PublicQuoteView } from '$lib/types/quotes';

	let { data }: { data: { quote: PublicQuoteView | null } } = $props();

	const token = $derived(page.params.token);
	const initialAction = $derived<'accepted' | 'declined' | 'changes_requested' | null>(
		data.quote?.status === 'accepted' && data.quote.deposit_paid_amount > 0 ? 'accepted' : null
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

	const taxPct = $derived(data.quote ? (Number(data.quote.tax_rate) * 100).toFixed(2) + '%' : '0%');

	const declineReasons = [
		{ value: 'price', label: 'Price is too high' },
		{ value: 'competitor', label: 'Going with someone else' },
		{ value: 'timing', label: "Timing isn't right" },
		{ value: 'scope', label: 'Scope changed' },
		{ value: 'other', label: 'Other' }
	] as const;

	async function acceptQuote() {
		busy = 'accept';
		try {
			const res = await fetch(`/q/${token}/accept`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				action = null;
				return;
			}
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

<div class="min-h-screen bg-background px-4 py-8 md:py-16">
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
				<div class="rounded-2xl border border-border bg-card p-8 text-center">
					<div
						class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
					>
						<Check class="h-6 w-6" />
					</div>
					<h1 class="mt-4 text-lg font-semibold">Quote accepted</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						Thanks! {data.quote.org_name} has been notified and will be in touch shortly.
					</p>
				</div>

				{#if owesDeposit && data.quote.deposit_amount}
					<div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
						<div class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
							<CreditCard class="h-5 w-5" />
							<p class="text-sm font-semibold">Deposit owed</p>
						</div>
						<p class="mt-2 text-sm text-amber-800/90 dark:text-amber-200/80">
							A deposit of <span class="font-semibold"
								>{formatCurrency(data.quote.deposit_amount)}</span
							>
							is requested to start. You can pay it now or later.
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
		{:else if action === 'changes_requested'}
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
		{:else}
			<div class="space-y-6">
				<header>
					<p class="text-sm text-muted-foreground">{data.quote.org_name}</p>
					<h1 class="mt-1 text-2xl font-semibold">Quote {data.quote.quote_number_display}</h1>
					<p class="mt-1 text-sm text-muted-foreground">{data.quote.title}</p>
				</header>

				{#if alreadyChangesRequested}
					<div
						class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
					>
						<p class="font-medium">Your change request was received</p>
						<p class="mt-1 text-amber-700/90 dark:text-amber-300/80">
							{data.quote.org_name} will review your request and send an updated quote shortly.
						</p>
					</div>
				{/if}

				<div class="rounded-2xl border border-border bg-card">
					<div
						class="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground"
					>
						<div class="grid grid-cols-12">
							<div class="col-span-7">Item</div>
							<div class="col-span-2 text-right">Qty</div>
							<div class="col-span-3 text-right">Amount</div>
						</div>
					</div>
					<ul class="divide-y divide-border">
						{#each data.quote.line_items as li (li.id)}
							<li class="grid grid-cols-12 px-4 py-3 text-sm">
								<div class="col-span-7">{li.description}</div>
								<div class="col-span-2 text-right tabular-nums">{Number(li.quantity)}</div>
								<div class="col-span-3 text-right tabular-nums">{formatCurrency(li.total)}</div>
							</li>
						{/each}
					</ul>
				</div>

				<dl class="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Subtotal</dt>
						<dd class="tabular-nums">{formatCurrency(data.quote.subtotal)}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Tax ({taxPct})</dt>
						<dd class="tabular-nums">{formatCurrency(data.quote.tax_amount)}</dd>
					</div>
					<div class="flex justify-between border-t border-border pt-2 text-base font-semibold">
						<dt>Total</dt>
						<dd class="tabular-nums">{formatCurrency(data.quote.total)}</dd>
					</div>
					{#if data.quote.deposit_required && data.quote.deposit_amount}
						<div
							class="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400"
						>
							A deposit of {formatCurrency(data.quote.deposit_amount)} is required to start.
						</div>
					{/if}
				</dl>

				{#if data.quote.notes}
					<div class="rounded-2xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
						{data.quote.notes}
					</div>
				{/if}

				{#if canTakeAction}
					<div class="space-y-2">
						<JetEngineButton
							class="min-h-[52px] w-full text-base"
							label="Accept quote"
							loadingLabel="Accepting…"
							successLabel="Accepted"
							state={busy === 'accept' ? 'loading' : 'idle'}
							disabled={busy !== null && busy !== 'accept'}
							onclick={acceptQuote}
						>
							{#snippet icon()}<Check class="h-5 w-5" />{/snippet}
						</JetEngineButton>
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
					</div>
				{/if}

				<p class="text-center text-xs text-muted-foreground">
					This quote was sent to you by {data.quote.org_name}.
					{#if data.quote.expires_at}
						It expires {new Date(data.quote.expires_at).toLocaleDateString('en-US')}.
					{/if}
				</p>
			</div>
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
