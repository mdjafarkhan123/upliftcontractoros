<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		ChevronLeft,
		ChevronRight,
		MapPin,
		MessageSquare,
		PenLine,
		ShieldCheck,
		User
	} from '@lucide/svelte';
	import type { PublicQuoteView, QuoteLinePhoto } from '$lib/types/quotes';

	// The single source of truth for "what the client sees" — rendered both on the live public
	// quote page (/q/[token]) and the contractor-facing preview, so the preview can never drift
	// from the real client view. The interactive Accept/Decline/Pay area is injected by the
	// parent via the `actions` snippet (live handlers on the public page; inert in preview).
	let {
		quote,
		selectedOptional = $bindable({}),
		actions
	}: {
		quote: PublicQuoteView;
		selectedOptional?: Record<string, boolean>;
		actions?: import('svelte').Snippet;
	} = $props();

	const orgInitials = $derived(
		(quote.org_name ?? '?')
			.split(/\s+/)
			.filter(Boolean)
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	const alreadyChangesRequested = $derived(quote.status === 'changes_requested');
	const taxPct = $derived((Number(quote.tax_rate) * 100).toFixed(2) + '%');

	// Group line items into sections (preserving order). A null label = ungrouped: no heading,
	// no subtotal. Items arrive ordered so a section's rows are contiguous.
	type PublicLine = PublicQuoteView['line_items'][number];
	const lineSections = $derived.by(() => {
		const items = (quote.line_items ?? []).filter((li) => !li.is_optional);
		const secs: { label: string | null; items: PublicLine[] }[] = [];
		for (const li of items) {
			const label = li.section_label?.trim() || null;
			const last = secs[secs.length - 1];
			if (last && last.label === label) last.items.push(li);
			else secs.push({ label, items: [li] });
		}
		return secs;
	});
	function sectionSubtotal(items: PublicLine[]): number {
		return items.reduce((s, li) => s + Number(li.total), 0);
	}

	// ── Per-line photo lightbox ─────────────────────────────────────────────────
	let lightbox = $state<{ photos: QuoteLinePhoto[]; index: number } | null>(null);
	function openLightbox(photos: QuoteLinePhoto[], i: number) {
		lightbox = { photos, index: i };
	}
	function lightboxStep(dir: -1 | 1) {
		if (!lightbox) return;
		const n = lightbox.photos.length;
		lightbox = { ...lightbox, index: (lightbox.index + dir + n) % n };
	}

	// ── Optional add-ons the customer can choose ────────────────────────────────
	const optionalLines = $derived((quote.line_items ?? []).filter((li) => li.is_optional));
	function toggleOptional(id: string) {
		selectedOptional = { ...selectedOptional, [id]: !selectedOptional[id] };
	}
	// Live totals = base (required) + selected optional add-ons, recomputed in the browser for
	// instant feedback. The server independently recomputes the authoritative total at acceptance.
	const liveTotals = $derived.by(() => {
		const base = Number(quote.subtotal ?? 0);
		const optSum = optionalLines.reduce(
			(s, li) => (selectedOptional[li.id] ? s + Number(li.total) : s),
			0
		);
		const sub = Math.round((base + optSum) * 100) / 100;
		const dType = quote.discount_type ?? 'none';
		const dVal = Number(quote.discount_value ?? 0);
		let discount = 0;
		if (dType === 'percent' && Number.isFinite(dVal) && dVal > 0) {
			discount = Math.round(sub * Math.min(dVal, 100)) / 100;
		} else if (dType === 'fixed' && Number.isFinite(dVal) && dVal > 0) {
			discount = Math.min(dVal, sub);
		}
		const discounted = Math.round((sub - discount) * 100) / 100;
		const rate = Number(quote.tax_rate ?? 0);
		const tax = Math.round(discounted * rate * 100) / 100;
		const grand = Math.round((discounted + tax) * 100) / 100;
		return { subtotal: sub, discount, tax, total: grand };
	});
	const discountText = $derived.by(() => {
		const base = quote.discount_label?.trim() || 'Discount';
		if (quote.discount_type === 'percent' && quote.discount_value) {
			const v = Number(quote.discount_value);
			return `${base} (${v.toFixed(v % 1 === 0 ? 0 : 2)}%)`;
		}
		return base;
	});
	const liveDepositAmount = $derived.by(() => {
		if (!quote.deposit_required) return null;
		if (quote.deposit_type === 'percent' && quote.deposit_percent) {
			return Math.round(liveTotals.total * Number(quote.deposit_percent)) / 100;
		}
		return quote.deposit_amount ? Number(quote.deposit_amount) : null;
	});
	const depositLabel = $derived.by(() => {
		if (quote.deposit_type === 'percent' && quote.deposit_percent) {
			return `A ${Number(quote.deposit_percent).toFixed(0)}% deposit of`;
		}
		return 'A deposit of';
	});
</script>

{#snippet brandHeader()}
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

{#snippet photoThumbs(photos: QuoteLinePhoto[])}
	{#if photos.length > 0}
		<div class="mt-2 flex flex-wrap gap-2">
			{#each photos as ph, i (ph.id)}
				<button
					type="button"
					class="h-14 w-14 overflow-hidden rounded-lg border border-border/60 transition-transform hover:scale-105"
					onclick={() => openLightbox(photos, i)}
					aria-label="View photo"
				>
					<img src={ph.thumb_url} alt="" class="h-full w-full object-cover" loading="lazy" />
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<div class="space-y-6">
	<!-- Branded header card -->
	<header class="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
		<div class="h-1.5 w-full" style="background-color: var(--brand);"></div>
		<div class="p-5 sm:p-6">
			<div class="flex items-start justify-between gap-4">
				{@render brandHeader()}
				<div class="shrink-0 text-right">
					<p class="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
						Quote
					</p>
					<p class="text-sm font-semibold tabular-nums">
						{quote.quote_number_display}
					</p>
				</div>
			</div>

			<h1 class="mt-5 text-2xl font-bold tracking-tight text-foreground">
				{quote.title}
			</h1>

			<div class="mt-5 border-t border-border pt-4">
				<div class="grid grid-cols-2 gap-3">
					<div class="flex items-center gap-2.5">
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
							<User class="h-4 w-4 text-muted-foreground" />
						</div>
						<div class="min-w-0">
							<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								Prepared for
							</p>
							<p class="truncate text-sm font-semibold">{quote.contact_name}</p>
						</div>
					</div>
					{#if quote.issued_by_name}
						<div class="flex items-center gap-2.5">
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
							>
								<User class="h-4 w-4 text-primary" />
							</div>
							<div class="min-w-0">
								<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									Prepared by
								</p>
								<p class="truncate text-sm font-semibold">{quote.issued_by_name}</p>
							</div>
						</div>
					{/if}
				</div>

				{#if quote.service_address}
					<div class="mt-3 flex items-center gap-2.5">
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
							<MapPin class="h-4 w-4 text-muted-foreground" />
						</div>
						<div class="min-w-0">
							<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								Service address
							</p>
							<p class="truncate text-sm font-semibold">
								{[
									quote.service_address.address_line_1,
									quote.service_address.address_line_2,
									[
										quote.service_address.city,
										quote.service_address.state,
										quote.service_address.zip
									]
										.filter(Boolean)
										.join(' ')
								]
									.filter(Boolean)
									.join(', ')}
							</p>
						</div>
					</div>
				{/if}
			</div>

			{#if quote.expires_at}
				<div
					class="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
				>
					<ShieldCheck class="h-3.5 w-3.5 shrink-0" style="color: var(--brand);" />
					<span>
						Valid until {new Date(quote.expires_at).toLocaleDateString('en-US', {
							month: 'long',
							day: 'numeric',
							year: 'numeric'
						})}
					</span>
				</div>
			{/if}
		</div>
	</header>

	{#if alreadyChangesRequested}
		<div
			class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
		>
			<p class="font-medium">Your change request was received</p>
			<p class="mt-1 text-amber-700/90 dark:text-amber-300/80">
				{quote.org_name} will review your request and send an updated quote shortly.
			</p>
		</div>
	{/if}

	<!-- Line items -->
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
			{#each lineSections as sec (sec.label ?? '__ungrouped__')}
				{#if sec.label}
					<li
						class="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
					>
						{sec.label}
					</li>
				{/if}
				{#each sec.items as li (li.id)}
					<li class="grid grid-cols-12 px-4 py-3 text-sm">
						<div class="col-span-7">
							<span class="font-medium text-foreground">{li.description}</span>
							{#if li.details}
								<p class="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
									{li.details}
								</p>
							{/if}
							{#if li.photos}{@render photoThumbs(li.photos)}{/if}
						</div>
						<div class="col-span-2 text-right tabular-nums">
							{Number(li.quantity)}{#if li.unit}<span class="text-muted-foreground"
									>&nbsp;{li.unit}</span
								>{/if}
						</div>
						<div class="col-span-3 text-right tabular-nums">{formatCurrency(li.total)}</div>
					</li>
				{/each}
				{#if sec.label}
					<li class="grid grid-cols-12 px-4 py-2 text-sm">
						<div class="col-span-9 text-right text-muted-foreground">
							{sec.label} subtotal
						</div>
						<div class="col-span-3 text-right font-semibold tabular-nums">
							{formatCurrency(sectionSubtotal(sec.items))}
						</div>
					</li>
				{/if}
			{/each}
		</ul>
	</div>

	<!-- Optional add-ons -->
	{#if optionalLines.length > 0}
		<div class="overflow-hidden rounded-2xl border border-amber-500/30 bg-card">
			<div class="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3">
				<p class="text-sm font-semibold">Optional add-ons</p>
				<p class="text-xs text-muted-foreground">
					Check any extras you'd like — your total updates automatically.
				</p>
			</div>
			<ul class="divide-y divide-border">
				{#each optionalLines as li (li.id)}
					<li>
						<label
							class="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 has-[:checked]:bg-amber-500/5"
						>
							<input
								type="checkbox"
								checked={!!selectedOptional[li.id]}
								onchange={() => toggleOptional(li.id)}
								class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
							/>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium">{li.description}</span>
								{#if li.details}
									<span class="block whitespace-pre-wrap text-xs text-muted-foreground">
										{li.details}
									</span>
								{/if}
								<span class="block text-xs text-muted-foreground">
									{Number(li.quantity)}{#if li.unit}&nbsp;{li.unit}{/if}
								</span>
								{#if li.photos}{@render photoThumbs(li.photos)}{/if}
							</span>
							<span class="shrink-0 text-sm font-medium tabular-nums"
								>+{formatCurrency(li.total)}</span
							>
						</label>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Totals -->
	<dl class="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
		<div class="flex justify-between">
			<dt class="text-muted-foreground">Subtotal</dt>
			<dd class="tabular-nums">{formatCurrency(liveTotals.subtotal)}</dd>
		</div>
		{#if liveTotals.discount > 0}
			<div class="flex justify-between">
				<dt class="text-emerald-600 dark:text-emerald-400">{discountText}</dt>
				<dd class="tabular-nums text-emerald-600 dark:text-emerald-400">
					−{formatCurrency(liveTotals.discount)}
				</dd>
			</div>
		{/if}
		<div class="flex justify-between">
			<dt class="text-muted-foreground">Tax ({taxPct})</dt>
			<dd class="tabular-nums">{formatCurrency(liveTotals.tax)}</dd>
		</div>
		<div
			class="mt-1 flex items-center justify-between rounded-lg px-3 py-2.5 text-base font-bold"
			style="background-color: color-mix(in srgb, var(--brand) 10%, transparent);"
		>
			<dt class="text-foreground">Total</dt>
			<dd class="tabular-nums" style="color: var(--brand);">
				{formatCurrency(liveTotals.total)}
			</dd>
		</div>
		{#if quote.deposit_required && liveDepositAmount}
			<div class="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
				{depositLabel}
				{formatCurrency(liveDepositAmount)} is required to start.
			</div>
		{/if}
	</dl>

	{#if quote.notes}
		<div class="rounded-2xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
			{quote.notes}
		</div>
	{/if}

	<!-- Business signature block (org-level "Authorized by" credential) -->
	{#if quote.signature_block_enabled && quote.signature_name}
		<div class="rounded-2xl border border-border bg-card p-5">
			<div class="mb-3 flex items-center gap-2 text-muted-foreground">
				<PenLine class="h-3.5 w-3.5" />
				<p class="text-[11px] font-semibold uppercase tracking-wider">Authorized by</p>
			</div>
			{#if quote.signature_image_url}
				<img
					src={quote.signature_image_url}
					alt="Authorized signature"
					class="mb-2 max-h-16 max-w-[240px] object-contain"
				/>
			{/if}
			<p class="text-sm font-semibold text-foreground">
				{quote.signature_name}{#if quote.signature_title}<span
						class="font-normal text-muted-foreground"
					>
						· {quote.signature_title}</span
					>{/if}
			</p>
			{#if quote.signature_statement}
				<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
					{quote.signature_statement}
				</p>
			{/if}
		</div>
	{/if}

	<!-- Action area — injected by the parent (live accept/decline/pay, or inert preview) -->
	{@render actions?.()}

	<p class="text-center text-xs text-muted-foreground">
		This quote was sent to you by {quote.org_name}.
		{#if quote.expires_at}
			It expires {new Date(quote.expires_at).toLocaleDateString('en-US')}.
		{/if}
	</p>
</div>

<Dialog.Root open={lightbox !== null} onOpenChange={(o) => !o && (lightbox = null)}>
	<Dialog.Content class="max-w-3xl border-0 bg-transparent p-0 shadow-none">
		{#if lightbox && lightbox.photos[lightbox.index]}
			<div class="relative flex items-center justify-center">
				<img
					src={lightbox.photos[lightbox.index].full_url}
					alt=""
					class="max-h-[80vh] w-auto rounded-lg object-contain"
				/>
				{#if lightbox.photos.length > 1}
					<button
						type="button"
						class="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md hover:bg-background"
						onclick={() => lightboxStep(-1)}
						aria-label="Previous photo"
					>
						<ChevronLeft class="h-5 w-5" />
					</button>
					<button
						type="button"
						class="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md hover:bg-background"
						onclick={() => lightboxStep(1)}
						aria-label="Next photo"
					>
						<ChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
