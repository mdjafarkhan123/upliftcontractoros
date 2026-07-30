<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { formatCurrency } from '$lib/utils/format';
	import { page } from '$app/state';

	type LineItem = {
		id: string;
		description: string;
		quantity: string;
		unit_price: string;
		total: string;
		taxable: boolean;
	};
	type PublicInvoice = {
		invoice_number_display: string;
		title: string;
		status: 'sent_not_due' | 'awaiting_payment' | 'paid' | 'past_due' | 'bad_debt';
		subtotal: string;
		discount_type: string;
		discount_value: string | null;
		discount_amount: string | null;
		discount_label: string | null;
		tax_rate: string;
		tax_amount: string;
		total: string;
		amount_paid: string;
		amount_due: string;
		tip_total: string;
		late_fee_total: string;
		notes: string | null;
		terms: string | null;
		due_date: string | null;
		org_name: string;
		has_stripe: boolean;
		tips_enabled: boolean;
		tip_presets: number[];
		line_items: LineItem[];
		// Read-only in-person signature, when the contractor collected one. Null otherwise.
		signature: { signer_name: string | null; signed_at: string; url: string } | null;
	};

	let { data }: { data: { invoice: PublicInvoice | null } } = $props();

	const token = $derived(page.params.token);

	// If customer returns from Stripe with ?paid=1, show success regardless
	// of status (webhook may still be processing).
	const justPaid = $derived(page.url.searchParams.get('paid') === '1');

	let busy = $state(false);
	let payError = $state<string | null>(null);
	let pdfBusy = $state(false);
	let showCustom = $state(false);
	let customAmountInput = $state('');

	// M7 tip selector: null = no tip chosen, a number = that preset percent, 'custom' = the
	// homeowner is typing a dollar amount. Tips are extra money on top of what's being charged.
	let tipChoice = $state<number | 'custom' | null>(null);
	let customTipInput = $state('');

	const amountDueCents = $derived(
		data.invoice ? Math.round(Number(data.invoice.amount_due) * 100) : 0
	);
	const customAmountCents = $derived.by(() => {
		const trimmed = customAmountInput.trim();
		if (trimmed === '') return null;
		const n = Number(trimmed);
		if (!Number.isFinite(n) || n <= 0) return null;
		return Math.round(n * 100);
	});
	const customAmountValid = $derived(
		customAmountCents !== null && customAmountCents > 0 && customAmountCents <= amountDueCents
	);

	const tipsEnabled = $derived(data.invoice?.tips_enabled ?? false);
	// Tip presets are computed off the invoice balance due (industry norm — the tip is on the
	// job, not on a partial payment). A custom tip is a flat dollar amount the homeowner types.
	const tipCents = $derived.by(() => {
		if (!tipsEnabled || tipChoice === null) return 0;
		if (tipChoice === 'custom') {
			const n = Number(customTipInput.trim());
			if (!Number.isFinite(n) || n <= 0) return 0;
			return Math.round(n * 100);
		}
		return Math.round((amountDueCents * tipChoice) / 100);
	});
	// What the primary "Pay" button will charge = balance due + any tip. The custom-amount
	// flow shows its own total (custom amount + tip) on its Continue button.
	const payFullTotalCents = $derived(amountDueCents + tipCents);
	const payCustomTotalCents = $derived((customAmountCents ?? 0) + tipCents);

	const isPaid = $derived(data.invoice?.status === 'paid' || justPaid);
	const isOverdue = $derived(data.invoice?.status === 'past_due' && !isPaid);
	const canPay = $derived(
		data.invoice !== null &&
			!isPaid &&
			data.invoice.has_stripe &&
			Number(data.invoice.amount_due) > 0
	);

	const taxPct = $derived(
		data.invoice ? (Number(data.invoice.tax_rate) * 100).toFixed(2) + '%' : '0%'
	);
	// Only surface the per-line "Tax exempt" hint when tax actually applies to the invoice.
	const hasTax = $derived(data.invoice ? Number(data.invoice.tax_rate) > 0 : false);

	// Tip already collected on this invoice (M7) — shown as its own row when > 0. Extra money,
	// separate from the balance, so it never appears in Subtotal/Total/Balance math.
	const tipTotalNum = $derived(data.invoice ? Number(data.invoice.tip_total ?? 0) : 0);

	// Invoice-level discount row — shown only when a real dollars-off amount exists.
	const discountNum = $derived(data.invoice ? Number(data.invoice.discount_amount ?? 0) : 0);
	const discountLabel = $derived.by(() => {
		const inv = data.invoice;
		if (!inv) return 'Discount';
		const base = inv.discount_label?.trim() || 'Discount';
		if (inv.discount_type === 'percent' && inv.discount_value) {
			const v = Number(inv.discount_value);
			return `${base} (${v.toFixed(v % 1 === 0 ? 0 : 2)}%)`;
		}
		return base;
	});

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

	async function pay(amountCents?: number) {
		busy = true;
		payError = null;
		try {
			const init: RequestInit = { method: 'POST' };
			const payload: { amount_cents?: number; tip_cents?: number } = {};
			if (amountCents !== undefined) payload.amount_cents = amountCents;
			if (tipCents > 0) payload.tip_cents = tipCents;
			if (Object.keys(payload).length > 0) {
				init.headers = { 'Content-Type': 'application/json' };
				init.body = JSON.stringify(payload);
			}
			const res = await fetch(`/i/${token}/pay`, init);
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

	function payFull() {
		void pay();
	}

	function payCustom() {
		if (!customAmountValid || customAmountCents === null) return;
		void pay(customAmountCents);
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

<div class="pub">
	<div class="pub__shell">
		{#if !data.invoice}
			<div class="pub-card pub-card--center">
				<h1 class="pub-card__title">Invoice no longer available</h1>
				<p class="pub-card__text">
					This link is invalid or has expired. Please contact the sender for assistance.
				</p>
			</div>
		{:else if isPaid}
			<div class="pub__stack">
				<div class="pub-card pub-card--center">
					<div class="pub-statusicon pub-statusicon--success">
						<i class="ri-check-line" aria-hidden="true"></i>
					</div>
					<h1 class="pub-card__title">Payment received</h1>
					<p class="pub-card__text">
						{data.invoice.org_name} has been notified. Thank you for your payment.
					</p>
				</div>

				<div class="pub-invoice__summary">
					<div class="pub-invoice__summary-row">
						<dt>Invoice</dt>
						<dd>{data.invoice.invoice_number_display}</dd>
					</div>
					{#if tipTotalNum > 0}
						<div class="pub-invoice__summary-row">
							<dt>Tip</dt>
							<dd>{formatCurrency(data.invoice.tip_total)}</dd>
						</div>
					{/if}
					<div class="pub-invoice__summary-row pub-invoice__summary-row--total">
						<dt>Total paid</dt>
						<dd>{formatCurrency(Number(data.invoice.total) + tipTotalNum)}</dd>
					</div>
				</div>

				<Button
					type="button"
					variant="outline"
					class="btn--full"
					loading={pdfBusy}
					loadingLabel="Preparing PDF…"
					onclick={downloadPdf}
				>
					<i class="ri-download-line" aria-hidden="true"></i>
					Download PDF
				</Button>
			</div>
		{:else}
			{@const inv = data.invoice}
			<div class="pub__stack pub-invoice">
				<header class="pub-invoice__header">
					<p class="pub-invoice__org">{inv.org_name}</p>
					<h1 class="pub-invoice__title">Invoice {inv.invoice_number_display}</h1>
					<p class="pub-invoice__subtitle">{inv.title}</p>
				</header>

				{#if isOverdue}
					<div class="pub-notice pub-notice--overdue">
						<i class="pub-notice__icon ri-error-warning-line" aria-hidden="true"></i>
						<p class="pub-notice__title">This invoice is overdue.</p>
					</div>
				{/if}

				{#if Number(inv.amount_paid) > 0 && Number(inv.amount_due) > 0}
					<div class="pub-notice pub-notice--partial">
						<i class="pub-notice__icon ri-time-line" aria-hidden="true"></i>
						<div>
							<p class="pub-notice__title">Partial payment received</p>
							<p class="pub-notice__text">
								{formatCurrency(inv.amount_paid)} received — {formatCurrency(inv.amount_due)} remaining.
							</p>
						</div>
					</div>
				{/if}

				<div class="pub-invoice__lines">
					<div class="pub-invoice__lines-head">
						<span>Item</span>
						<span class="pub-invoice__qty">Qty</span>
						<span class="pub-invoice__amount">Amount</span>
					</div>
					{#each inv.line_items as li (li.id)}
						<div class="pub-invoice__line">
							<span>
								{li.description}
								{#if hasTax && !li.taxable}
									<span class="pub-invoice__taxexempt">Tax exempt</span>
								{/if}
							</span>
							<span class="pub-invoice__qty">{Number(li.quantity)}</span>
							<span class="pub-invoice__amount">{formatCurrency(li.total)}</span>
						</div>
					{/each}
				</div>

				<dl class="pub-invoice__totals">
					<div class="pub-invoice__total-row">
						<dt>Subtotal</dt>
						<dd>{formatCurrency(inv.subtotal)}</dd>
					</div>
					{#if discountNum > 0}
						<div class="pub-invoice__total-row pub-invoice__total-row--discount">
							<dt>{discountLabel}</dt>
							<dd>−{formatCurrency(inv.discount_amount ?? '0')}</dd>
						</div>
					{/if}
					<div class="pub-invoice__total-row">
						<dt>Tax ({taxPct})</dt>
						<dd>{formatCurrency(inv.tax_amount)}</dd>
					</div>
					{#if Number(inv.late_fee_total) > 0}
						<div class="pub-invoice__total-row">
							<dt>Late fee</dt>
							<dd>{formatCurrency(inv.late_fee_total)}</dd>
						</div>
					{/if}
					<div class="pub-invoice__total-row pub-invoice__total-row--grand">
						<dt>Total</dt>
						<dd>{formatCurrency(inv.total)}</dd>
					</div>
					{#if Number(inv.amount_paid) > 0 && Number(inv.amount_due) > 0}
						<div class="pub-invoice__total-row pub-invoice__total-row--paid">
							<dt>Paid</dt>
							<dd>−{formatCurrency(inv.amount_paid)}</dd>
						</div>
						<div class="pub-invoice__total-row pub-invoice__total-row--balance">
							<dt>Balance due</dt>
							<dd>{formatCurrency(inv.amount_due)}</dd>
						</div>
					{/if}
					{#if tipTotalNum > 0}
						<div class="pub-invoice__total-row pub-invoice__total-row--paid">
							<dt>Tip</dt>
							<dd>{formatCurrency(inv.tip_total)}</dd>
						</div>
					{/if}
				</dl>

				{#if inv.due_date}
					<p class="pub-invoice__due">
						Due {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-US', {
							month: 'long',
							day: 'numeric',
							year: 'numeric'
						})}
					</p>
				{/if}

				{#if inv.notes}
					<div class="pub-invoice__notes">{inv.notes}</div>
				{/if}

				{#if inv.terms?.trim()}
					<div class="pub-invoice__terms">
						<p class="pub-invoice__terms-title">Terms &amp; Conditions</p>
						<div class="pub-invoice__terms-body">{inv.terms}</div>
					</div>
				{/if}

				{#if inv.signature}
					<div class="pub-invoice__signature">
						<p class="pub-invoice__signature-title">Signature</p>
						<img
							class="pub-invoice__signature-img"
							src={inv.signature.url}
							alt="Customer signature"
						/>
						<p class="pub-invoice__signature-meta">
							Signed{inv.signature.signer_name ? ` by ${inv.signature.signer_name}` : ''}
							{#if inv.signature.signed_at}
								· {new Date(inv.signature.signed_at).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric'
								})}
							{/if}
						</p>
					</div>
				{/if}

				{#if canPay}
					<div class="pub-invoice__pay">
						{#if tipsEnabled}
							<div class="pub-invoice__tip">
								<p class="pub-invoice__tip-title">Add a tip for {inv.org_name}?</p>
								<div class="pub-invoice__tip-options">
									{#each inv.tip_presets as pct (pct)}
										<button
											type="button"
											class="pub-invoice__tip-btn"
											class:pub-invoice__tip-btn--active={tipChoice === pct}
											onclick={() => (tipChoice = tipChoice === pct ? null : pct)}
											disabled={busy}
										>
											<span class="pub-invoice__tip-pct">{pct}%</span>
											<span class="pub-invoice__tip-amt"
												>{formatCurrency((amountDueCents * pct) / 100 / 100)}</span
											>
										</button>
									{/each}
									<button
										type="button"
										class="pub-invoice__tip-btn"
										class:pub-invoice__tip-btn--active={tipChoice === 'custom'}
										onclick={() => (tipChoice = tipChoice === 'custom' ? null : 'custom')}
										disabled={busy}
									>
										Custom
									</button>
									<button
										type="button"
										class="pub-invoice__tip-btn"
										class:pub-invoice__tip-btn--active={tipChoice === null}
										onclick={() => (tipChoice = null)}
										disabled={busy}
									>
										No tip
									</button>
								</div>
								{#if tipChoice === 'custom'}
									<div class="pub-invoice__custom-field">
										<span class="pub-invoice__custom-prefix">$</span>
										<input
											type="text"
											inputmode="decimal"
											pattern="[0-9]*\.?[0-9]*"
											autocomplete="off"
											bind:value={customTipInput}
											placeholder="0.00"
											disabled={busy}
											aria-label="Custom tip amount"
											class="field__input pub-invoice__custom-input"
										/>
									</div>
								{/if}
							</div>
						{/if}

						<Button
							class="btn--full"
							loadingLabel="Redirecting to payment…"
							successLabel="Redirecting…"
							loading={busy}
							onclick={payFull}
						>
							{tipCents > 0
								? `Pay ${formatCurrency(payFullTotalCents / 100)} (incl. ${formatCurrency(tipCents / 100)} tip)`
								: `Pay ${formatCurrency(inv.amount_due)}`}
							{#snippet icon()}<i class="ri-bank-card-line" aria-hidden="true"></i>{/snippet}
						</Button>

						{#if !showCustom}
							<button
								type="button"
								class="pub-invoice__pay-alt"
								onclick={() => (showCustom = true)}
								disabled={busy}
							>
								Pay a different amount
							</button>
						{:else}
							<div class="pub-invoice__custom">
								<label class="pub-invoice__custom-label" for="custom-amount">Custom amount</label>
								<div class="pub-invoice__custom-field">
									<span class="pub-invoice__custom-prefix">$</span>
									<input
										id="custom-amount"
										type="text"
										inputmode="decimal"
										pattern="[0-9]*\.?[0-9]*"
										autocomplete="off"
										bind:value={customAmountInput}
										placeholder="0.00"
										disabled={busy}
										class="field__input pub-invoice__custom-input"
									/>
								</div>
								<p class="pub-invoice__custom-hint">
									Balance due: {formatCurrency(inv.amount_due)}
								</p>
								<div class="pub-invoice__custom-actions">
									<Button
										type="button"
										variant="outline"
										class="btn--full"
										disabled={busy}
										onclick={() => {
											showCustom = false;
											customAmountInput = '';
											payError = null;
										}}
									>
										Cancel
									</Button>
									<Button
										type="button"
										variant="default"
										class="btn--full"
										loading={busy}
										loadingLabel="Redirecting…"
										disabled={!customAmountValid}
										onclick={payCustom}
									>
										{#if customAmountValid && tipCents > 0}
											Pay {formatCurrency(payCustomTotalCents / 100)}
										{:else}
											Continue
										{/if}
									</Button>
								</div>
							</div>
						{/if}

						{#if payError}
							<p class="pub-invoice__error">{payError}</p>
						{/if}
					</div>
				{:else if !inv.has_stripe}
					<div class="pub-invoice__no-stripe">
						Contact {inv.org_name} for payment instructions.
					</div>
				{/if}

				<Button
					type="button"
					variant="outline"
					class="btn--full"
					loading={pdfBusy}
					loadingLabel="Preparing PDF…"
					onclick={downloadPdf}
				>
					<i class="ri-download-line" aria-hidden="true"></i>
					Download PDF
				</Button>

				<p class="pub-invoice__footnote">
					This invoice was sent to you by {inv.org_name}.
				</p>
			</div>
		{/if}
	</div>
</div>
