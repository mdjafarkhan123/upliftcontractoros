<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import { Check, CreditCard, Clock, AlertCircle, Download } from '@lucide/svelte';
	import { page } from '$app/state';

	type LineItem = { id: string; description: string; quantity: string; unit_price: string; total: string };
	type PublicInvoice = {
		invoice_number_display: string;
		title: string;
		status: 'sent' | 'partially_paid' | 'paid' | 'overdue';
		subtotal: string;
		tax_rate: string;
		tax_amount: string;
		total: string;
		amount_paid: string;
		amount_due: string;
		notes: string | null;
		due_date: string | null;
		org_name: string;
		has_stripe: boolean;
		line_items: LineItem[];
	};

	let { data }: { data: { invoice: PublicInvoice | null } } = $props();

	const token = $derived(page.params.token);

	// If customer returns from Stripe with ?paid=1, show success regardless
	// of status (webhook may still be processing).
	const justPaid = $derived(page.url.searchParams.get('paid') === '1');

	let busy = $state(false);
	let payError = $state<string | null>(null);
	let pdfBusy = $state(false);

	const isPaid = $derived(data.invoice?.status === 'paid' || justPaid);
	const isOverdue = $derived(data.invoice?.status === 'overdue' && !isPaid);
	const canPay = $derived(
		data.invoice !== null &&
			!isPaid &&
			data.invoice.has_stripe &&
			Number(data.invoice.amount_due) > 0
	);

	const taxPct = $derived(
		data.invoice ? (Number(data.invoice.tax_rate) * 100).toFixed(2) + '%' : '0%'
	);

	async function downloadPdf() {
		if (pdfBusy) return;
		pdfBusy = true;
		try {
			const res = await fetch(`/i/${token}/pdf`);
			const body = await res.json().catch(() => ({}));
			if (res.ok && body.data?.url) window.open(body.data.url as string, '_blank');
		} finally {
			pdfBusy = false;
		}
	}

	async function pay() {
		busy = true;
		payError = null;
		try {
			const res = await fetch(`/i/${token}/pay`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.data?.url) {
				payError = body.error ?? 'Could not start payment. Please try again.';
				return;
			}
			window.location.href = body.data.url as string;
		} catch {
			payError = 'Network error. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>
		{data.invoice
			? `${data.invoice.org_name} — Invoice ${data.invoice.invoice_number_display}`
			: 'Invoice'}
	</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background px-4 py-8 md:py-16">
	<div class="mx-auto max-w-xl">
		{#if !data.invoice}
			<div class="rounded-2xl border border-border bg-card p-8 text-center">
				<h1 class="text-lg font-semibold">Invoice no longer available</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					This link is invalid or has expired. Please contact the sender for assistance.
				</p>
			</div>
		{:else if isPaid}
			<div class="space-y-4">
				<div class="rounded-2xl border border-border bg-card p-8 text-center">
					<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
						<Check class="h-6 w-6" />
					</div>
					<h1 class="mt-4 text-lg font-semibold">Payment received</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{data.invoice.org_name} has been notified. Thank you for your payment.
					</p>
				</div>

				<div class="rounded-2xl border border-border bg-card p-4">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Invoice</span>
						<span class="font-medium">{data.invoice.invoice_number_display}</span>
					</div>
					<div class="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
						<span>Total paid</span>
						<span>{formatCurrency(data.invoice.total)}</span>
					</div>
				</div>

				<Button
					variant="outline"
					class="min-h-[44px] w-full"
					onclick={downloadPdf}
					disabled={pdfBusy}
				>
					<Download class="mr-2 h-4 w-4" />
					{pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
				</Button>
			</div>
		{:else}
			{@const inv = data.invoice}
			<div class="space-y-6">
				<header>
					<p class="text-sm text-muted-foreground">{inv.org_name}</p>
					<h1 class="mt-1 text-2xl font-semibold">Invoice {inv.invoice_number_display}</h1>
					<p class="mt-1 text-sm text-muted-foreground">{inv.title}</p>
				</header>

				{#if isOverdue}
					<div class="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
						<AlertCircle class="h-4 w-4 shrink-0" />
						<p class="font-medium">This invoice is overdue.</p>
					</div>
				{/if}

				{#if inv.status === 'partially_paid'}
					<div class="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
						<Clock class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
						<div>
							<p class="font-medium text-amber-800 dark:text-amber-200">Partial payment received</p>
							<p class="mt-0.5 text-amber-700/90 dark:text-amber-300/80">
								{formatCurrency(inv.amount_paid)} received — {formatCurrency(inv.amount_due)} remaining.
							</p>
						</div>
					</div>
				{/if}

				<div class="rounded-2xl border border-border bg-card">
					<div class="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
						<div class="grid grid-cols-12">
							<div class="col-span-7">Item</div>
							<div class="col-span-2 text-right">Qty</div>
							<div class="col-span-3 text-right">Amount</div>
						</div>
					</div>
					<ul class="divide-y divide-border">
						{#each inv.line_items as li (li.id)}
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
						<dd class="tabular-nums">{formatCurrency(inv.subtotal)}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Tax ({taxPct})</dt>
						<dd class="tabular-nums">{formatCurrency(inv.tax_amount)}</dd>
					</div>
					<div class="flex justify-between border-t border-border pt-2 text-base font-semibold">
						<dt>Total</dt>
						<dd class="tabular-nums">{formatCurrency(inv.total)}</dd>
					</div>
					{#if inv.status === 'partially_paid' && Number(inv.amount_paid) > 0}
						<div class="flex justify-between text-emerald-700 dark:text-emerald-400">
							<dt>Paid</dt>
							<dd class="tabular-nums">−{formatCurrency(inv.amount_paid)}</dd>
						</div>
						<div class="flex justify-between border-t border-border pt-2 font-semibold">
							<dt>Balance due</dt>
							<dd class="tabular-nums">{formatCurrency(inv.amount_due)}</dd>
						</div>
					{/if}
				</dl>

				{#if inv.due_date}
					<p class="text-center text-sm text-muted-foreground">
						Due {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
					</p>
				{/if}

				{#if inv.notes}
					<div class="rounded-2xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
						{inv.notes}
					</div>
				{/if}

				{#if canPay}
					<div class="space-y-2">
						<JetEngineButton
							class="min-h-[52px] w-full text-base"
							label="Pay {formatCurrency(inv.amount_due)}"
							loadingLabel="Redirecting to payment…"
							successLabel="Redirecting…"
							state={busy ? 'loading' : 'idle'}
							onclick={pay}
						>
							{#snippet icon()}<CreditCard class="h-5 w-5" />{/snippet}
						</JetEngineButton>
						{#if payError}
							<p class="text-center text-xs text-destructive">{payError}</p>
						{/if}
					</div>
				{:else if !inv.has_stripe}
					<div class="rounded-2xl border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
						Contact {inv.org_name} for payment instructions.
					</div>
				{/if}

				<Button
					variant="outline"
					class="min-h-[44px] w-full"
					onclick={downloadPdf}
					disabled={pdfBusy}
				>
					<Download class="mr-2 h-4 w-4" />
					{pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
				</Button>

				<p class="text-center text-xs text-muted-foreground">
					This invoice was sent to you by {inv.org_name}.
				</p>
			</div>
		{/if}
	</div>
</div>
