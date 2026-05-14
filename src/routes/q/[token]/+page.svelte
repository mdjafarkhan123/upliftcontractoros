<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { Check, X } from '@lucide/svelte';
	import { page } from '$app/state';
	import type { PublicQuoteView } from '$lib/types/quotes';

	let { data }: { data: { quote: PublicQuoteView | null } } = $props();

	const token = $derived(page.params.token);
	let action = $state<'accepted' | 'declined' | null>(null);
	let busy = $state<'accept' | 'decline' | null>(null);
	let confirmingDecline = $state(false);

	const taxPct = $derived(
		data.quote ? (Number(data.quote.tax_rate) * 100).toFixed(2) + '%' : '0%'
	);

	async function doAction(kind: 'accept' | 'decline') {
		busy = kind;
		try {
			const res = await fetch(`/q/${token}/${kind}`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				action = null;
				return;
			}
			action = (body.data?.status as 'accepted' | 'declined') ?? null;
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>{data.quote ? `${data.quote.org_name} — Quote ${data.quote.quote_number_display}` : 'Quote'}</title>
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
			<div class="rounded-2xl border border-border bg-card p-8 text-center">
				<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
					<Check class="h-6 w-6" />
				</div>
				<h1 class="mt-4 text-lg font-semibold">Quote accepted</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					Thanks! {data.quote.org_name} has been notified and will be in touch shortly.
				</p>
			</div>
		{:else if action === 'declined'}
			<div class="rounded-2xl border border-border bg-card p-8 text-center">
				<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<X class="h-6 w-6" />
				</div>
				<h1 class="mt-4 text-lg font-semibold">Quote declined</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					Thanks for letting us know. {data.quote.org_name} has been notified.
				</p>
			</div>
		{:else}
			<div class="space-y-6">
				<header>
					<p class="text-sm text-muted-foreground">{data.quote.org_name}</p>
					<h1 class="mt-1 text-2xl font-semibold">Quote {data.quote.quote_number_display}</h1>
					<p class="mt-1 text-sm text-muted-foreground">{data.quote.title}</p>
				</header>

				<div class="rounded-2xl border border-border bg-card">
					<div class="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
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
						<div class="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
							A deposit of {formatCurrency(data.quote.deposit_amount)} is required to start.
						</div>
					{/if}
				</dl>

				{#if data.quote.notes}
					<div class="rounded-2xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
						{data.quote.notes}
					</div>
				{/if}

				<div class="space-y-2">
					<JetEngineButton
						class="min-h-[52px] w-full text-base"
						label="Accept quote"
						loadingLabel="Accepting…"
						successLabel="Accepted"
						state={busy === 'accept' ? 'loading' : 'idle'}
						disabled={busy !== null && busy !== 'accept'}
						onclick={() => doAction('accept')}
					>
						{#snippet icon()}<Check class="h-5 w-5" />{/snippet}
					</JetEngineButton>
					{#if !confirmingDecline}
						<Button
							variant="outline"
							class="min-h-[44px] w-full"
							onclick={() => (confirmingDecline = true)}
							disabled={busy !== null}
						>
							Decline
						</Button>
					{:else}
						<div class="rounded-xl border border-border bg-card p-3 text-sm">
							<p class="text-muted-foreground">Decline this quote?</p>
							<div class="mt-2 grid grid-cols-2 gap-2">
								<Button variant="outline" onclick={() => (confirmingDecline = false)} disabled={busy !== null}>
									Cancel
								</Button>
								<JetEngineButton
									variant="destructive"
									label="Confirm decline"
									loadingLabel="Declining…"
									successLabel="Declined"
									state={busy === 'decline' ? 'loading' : 'idle'}
									disabled={busy !== null && busy !== 'decline'}
									onclick={() => doAction('decline')}
								/>
							</div>
						</div>
					{/if}
				</div>

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
