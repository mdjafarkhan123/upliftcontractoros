<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { PublicQuoteView, QuoteLinePhoto } from '$lib/types/quotes';

	// The single source of truth for "what the client sees" — rendered both on the live public
	// quote page (/q/[token]) and the contractor-facing preview, so the preview can never drift
	// from the real client view. The interactive Accept/Decline/Pay area is injected by the
	// parent via the `actions` snippet (live handlers on the public page; inert in preview).
	let {
		quote,
		selectedOptional = $bindable({}),
		selectedPackageId = $bindable(null),
		actions
	}: {
		quote: PublicQuoteView;
		selectedOptional?: Record<string, boolean>;
		// Good-Better-Best: the tier the customer has selected (parent-owned, sent on accept).
		// Null / ignored on a simple quote.
		selectedPackageId?: string | null;
		actions?: import('svelte').Snippet;
	} = $props();

	// ── Good-Better-Best tiers ──────────────────────────────────────────────────
	const packages = $derived(quote.packages ?? []);
	const isTiered = $derived(packages.length > 0);
	type PkgLine = PublicQuoteView['line_items'][number];
	function pkgLines(pkgId: string): PkgLine[] {
		return (quote.line_items ?? []).filter((li) => li.package_id === pkgId);
	}
	function pkgRequired(pkgId: string): PkgLine[] {
		return pkgLines(pkgId).filter((li) => !li.is_optional);
	}
	function pkgOptional(pkgId: string): PkgLine[] {
		return pkgLines(pkgId).filter((li) => li.is_optional);
	}
	const selectedPkg = $derived(packages.find((p) => p.id === selectedPackageId) ?? null);
	// Pre-select the recommended tier (fallback: first) so the customer sees a price immediately.
	$effect(() => {
		if (isTiered && (selectedPackageId === null || !packages.some((p) => p.id === selectedPackageId))) {
			selectedPackageId = (packages.find((p) => p.is_recommended) ?? packages[0])?.id ?? null;
		}
	});
	function selectPackage(id: string) {
		selectedPackageId = id;
	}

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
	// Only surface per-line "Tax exempt" hints when the quote actually charges tax — otherwise
	// every line is effectively untaxed and the label would just be noise.
	const hasTax = $derived(Number(quote.tax_rate) > 0);

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
	// On a tiered quote the add-ons are scoped to the SELECTED package; on a simple quote they
	// are all optional lines (today's behavior).
	const optionalLines = $derived(
		isTiered
			? selectedPkg
				? pkgOptional(selectedPkg.id)
				: []
			: (quote.line_items ?? []).filter((li) => li.is_optional)
	);
	function toggleOptional(id: string) {
		selectedOptional = { ...selectedOptional, [id]: !selectedOptional[id] };
	}
	// Pure totals math (base required subtotal + chosen add-ons → discount → tax). Reused for the
	// live selected-tier totals AND each package card's headline price. Mirrors the server's
	// accept-route math, which applies the quote-level discount to whichever tier is chosen.
	// `taxableBase` / `taxableOpt` are the TAXABLE portions of base / add-ons. Only they feed the
	// tax base, and the quote-level discount is allocated proportionally across the whole subtotal
	// before tax — mirrors the accept route exactly. Collapses to discounted × rate when every
	// line is taxable.
	function computeTotals(base: number, optSum: number, taxableBase: number, taxableOpt: number) {
		const sub = Math.round((base + optSum) * 100) / 100;
		const taxableSub = Math.round((taxableBase + taxableOpt) * 100) / 100;
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
		const taxableAfterDiscount = sub > 0 ? (taxableSub * discounted) / sub : 0;
		const tax = Math.round(taxableAfterDiscount * rate * 100) / 100;
		const grand = Math.round((discounted + tax) * 100) / 100;
		return { subtotal: sub, discount, tax, total: grand };
	}
	// Sum the taxable portion of a set of lines (absent taxable = taxable, the default).
	function taxableSumOf(lines: PkgLine[]): number {
		return lines.reduce((s, li) => (li.taxable === false ? s : s + Number(li.total)), 0);
	}
	// Base required subtotal for the current view: the selected tier's subtotal when tiered,
	// else the quote's headline subtotal.
	const baseSubtotal = $derived(
		isTiered ? Number(selectedPkg?.subtotal ?? 0) : Number(quote.subtotal ?? 0)
	);
	// Live totals = base + selected optional add-ons, recomputed in the browser for instant
	// feedback. The server independently recomputes the authoritative total at acceptance.
	// Required lines feeding the current view — the selected tier's when tiered, else all
	// required lines. Used for the taxable-base portion of the live tax.
	const requiredLinesForView = $derived(
		isTiered
			? selectedPkg
				? pkgRequired(selectedPkg.id)
				: []
			: (quote.line_items ?? []).filter((li) => !li.is_optional)
	);
	const liveTotals = $derived.by(() => {
		const optSum = optionalLines.reduce(
			(s, li) => (selectedOptional[li.id] ? s + Number(li.total) : s),
			0
		);
		const taxableOpt = optionalLines.reduce(
			(s, li) => (selectedOptional[li.id] && li.taxable !== false ? s + Number(li.total) : s),
			0
		);
		return computeTotals(baseSubtotal, optSum, taxableSumOf(requiredLinesForView), taxableOpt);
	});
	// Each package card's all-in headline price (required items only, discount + tax applied).
	function pkgCardTotal(pkgId: string, pkgSubtotal: string): number {
		return computeTotals(Number(pkgSubtotal), 0, taxableSumOf(pkgRequired(pkgId)), 0).total;
	}
	// A package's required lines grouped into contiguous sections (same rule as the flat list).
	function pkgSections(pkgId: string): { label: string | null; items: PkgLine[] }[] {
		const secs: { label: string | null; items: PkgLine[] }[] = [];
		for (const li of pkgRequired(pkgId)) {
			const label = li.section_label?.trim() || null;
			const last = secs[secs.length - 1];
			if (last && last.label === label) last.items.push(li);
			else secs.push({ label, items: [li] });
		}
		return secs;
	}
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

{#snippet photoThumbs(photos: QuoteLinePhoto[])}
	{#if photos.length > 0}
		<div class="quote-doc__line-photos">
			{#each photos as ph, i (ph.id)}
				<button
					type="button"
					class="quote-doc__line-photo-btn"
					onclick={() => openLightbox(photos, i)}
					aria-label="View photo"
				>
					<img src={ph.thumb_url} alt="" loading="lazy" />
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

<div class="quote-doc">
	<!-- Branded header card -->
	<header class="quote-doc__header-card">
		<div class="quote-doc__brand-bar" style="background-color: var(--brand);"></div>
		<div class="quote-doc__header-body">
			<div class="quote-doc__header-top">
				<div class="quote-doc__brand-wrap">
					{#if quote.org_logo_url}
						<img
							class="quote-doc__brand-logo"
							src={quote.org_logo_url}
							alt={quote.org_name}
						/>
					{:else}
						<div
							class="quote-doc__brand-initials"
							style="background-color: var(--brand); color: var(--brand-fg);"
						>
							{orgInitials}
						</div>
					{/if}
					<div style="min-width:0;">
						<p class="quote-doc__brand-name">{quote.org_name}</p>
						{#if quote.org_tagline}
							<p class="quote-doc__brand-tagline">{quote.org_tagline}</p>
						{/if}
					</div>
				</div>
				<div class="quote-doc__quote-ref">
					<p class="quote-doc__quote-label">Quote</p>
					<p class="quote-doc__quote-num">{quote.quote_number_display}</p>
				</div>
			</div>

			<h1 class="quote-doc__title">{quote.title}</h1>

			<div class="quote-doc__meta-section">
				<div class="quote-doc__meta-grid">
					<div class="quote-doc__meta-item">
						<div class="quote-doc__meta-icon quote-doc__meta-icon--neutral">
							<i class="ri-user-line" aria-hidden="true"></i>
						</div>
						<div style="min-width:0;">
							<p class="quote-doc__meta-row-label">Prepared for</p>
							<p class="quote-doc__meta-row-value">{quote.contact_name}</p>
						</div>
					</div>
					{#if quote.issued_by_name}
						<div class="quote-doc__meta-item">
							<div class="quote-doc__meta-icon quote-doc__meta-icon--brand">
								<i class="ri-user-line" aria-hidden="true"></i>
							</div>
							<div style="min-width:0;">
								<p class="quote-doc__meta-row-label">Prepared by</p>
								<p class="quote-doc__meta-row-value">{quote.issued_by_name}</p>
							</div>
						</div>
					{/if}
				</div>

				{#if quote.service_address}
					<div class="quote-doc__meta-item" style="margin-top: 12px;">
						<div class="quote-doc__meta-icon quote-doc__meta-icon--neutral">
							<i class="ri-map-pin-line" aria-hidden="true"></i>
						</div>
						<div style="min-width:0;">
							<p class="quote-doc__meta-row-label">Service address</p>
							<p class="quote-doc__meta-row-value">
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
				<div class="quote-doc__validity">
					<i class="ri-shield-check-line" aria-hidden="true" style="color: var(--brand);"></i>
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
		<div class="quote-doc__changes-banner">
			<p class="quote-doc__changes-title">Your change request was received</p>
			<p class="quote-doc__changes-body">
				{quote.org_name} will review your request and send an updated quote shortly.
			</p>
		</div>
	{/if}

	{#if isTiered}
		<!-- Good-Better-Best: side-by-side package selection -->
		<div class="quote-doc__pkgs-card">
			<div class="quote-doc__pkgs-head">
				<p class="quote-doc__pkgs-title">Choose your package</p>
				<p class="quote-doc__pkgs-sub">
					Pick the option that's right for you — your total updates below.
				</p>
			</div>
			<div class="quote-doc__pkgs-grid">
				{#each packages as pkg (pkg.id)}
					{@const selected = selectedPackageId === pkg.id}
					<button
						type="button"
						class="quote-doc__pkg"
						class:quote-doc__pkg--selected={selected}
						class:quote-doc__pkg--recommended={pkg.is_recommended}
						style={selected ? 'border-color: var(--brand);' : ''}
						onclick={() => selectPackage(pkg.id)}
						aria-pressed={selected}
					>
						{#if pkg.is_recommended}
							<span
								class="quote-doc__pkg-badge"
								style="background-color: var(--brand); color: var(--brand-fg);">Recommended</span
							>
						{/if}
						<div class="quote-doc__pkg-top">
							<span class="quote-doc__pkg-radio" style={selected ? 'color: var(--brand);' : ''}>
								<i
									class={selected ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}
									aria-hidden="true"
								></i>
							</span>
							<span class="quote-doc__pkg-name">{pkg.name}</span>
						</div>
						<div class="quote-doc__pkg-price" style="color: var(--brand);">
							{formatCurrency(pkgCardTotal(pkg.id, pkg.subtotal))}
						</div>
						<ul class="quote-doc__pkg-lines">
							{#each pkgSections(pkg.id) as sec (sec.label ?? '__u__')}
								{#if sec.label}
									<li class="quote-doc__pkg-sec">{sec.label}</li>
								{/if}
								{#each sec.items as li (li.id)}
									<li class="quote-doc__pkg-line">
										<i class="ri-check-line" aria-hidden="true" style="color: var(--brand);"></i>
										<span class="quote-doc__pkg-line-desc">
											{li.description}{#if Number(li.quantity) !== 1}<span class="quote-doc__pkg-line-qty"
													>&nbsp;× {Number(li.quantity)}{#if li.unit}&nbsp;{li.unit}{/if}</span
												>{/if}
										</span>
										<span class="quote-doc__pkg-line-amt">{formatCurrency(li.total)}</span>
									</li>
								{/each}
							{/each}
						</ul>
					</button>
				{/each}
			</div>
		</div>
	{:else}
		<!-- Line items -->
		<div class="quote-doc__lines-card">
			<div class="quote-doc__lines-header">
				<span>Item</span>
				<span style="text-align:right;">Qty</span>
				<span style="text-align:right;">Amount</span>
			</div>
			<ul class="quote-doc__lines-list">
				{#each lineSections as sec (sec.label ?? '__ungrouped__')}
					{#if sec.label}
						<li class="quote-doc__section-label">{sec.label}</li>
					{/if}
					{#each sec.items as li (li.id)}
						<li class="quote-doc__line-row">
							<div>
								<span class="quote-doc__line-desc">{li.description}</span>
								{#if li.details}
									<p class="quote-doc__line-details">{li.details}</p>
								{/if}
								{#if hasTax && li.taxable === false}
									<p class="quote-doc__line-taxexempt">
										<i class="ri-price-tag-3-line" aria-hidden="true"></i>Tax exempt
									</p>
								{/if}
								{#if li.photos}{@render photoThumbs(li.photos)}{/if}
							</div>
							<div class="quote-doc__line-qty">
								{Number(li.quantity)}{#if li.unit}<span class="quote-doc__line-unit">&nbsp;{li.unit}</span>{/if}
							</div>
							<div class="quote-doc__line-amount">{formatCurrency(li.total)}</div>
						</li>
					{/each}
					{#if sec.label}
						<li class="quote-doc__section-subtotal-row">
							<span class="quote-doc__section-subtotal-label">{sec.label} subtotal</span>
							<span class="quote-doc__section-subtotal-value">{formatCurrency(sectionSubtotal(sec.items))}</span>
						</li>
					{/if}
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Optional add-ons -->
	{#if optionalLines.length > 0}
		<div class="quote-doc__optional-card">
			<div class="quote-doc__optional-header">
				<p class="quote-doc__optional-title">
					Optional add-ons{#if isTiered && selectedPkg}<span class="quote-doc__optional-scope">
							· {selectedPkg.name}</span
						>{/if}
				</p>
				<p class="quote-doc__optional-sub">Check any extras you'd like — your total updates automatically.</p>
			</div>
			<ul class="quote-doc__optional-list">
				{#each optionalLines as li (li.id)}
					<li class="quote-doc__optional-item">
						<label class="quote-doc__optional-label">
							<input
								type="checkbox"
								class="quote-doc__optional-check"
								checked={!!selectedOptional[li.id]}
								onchange={() => toggleOptional(li.id)}
							/>
							<span class="quote-doc__optional-body">
								<span class="quote-doc__optional-item-title">{li.description}</span>
								{#if li.details}
									<span class="quote-doc__optional-item-details">{li.details}</span>
								{/if}
								<span class="quote-doc__optional-item-qty">
									{Number(li.quantity)}{#if li.unit}&nbsp;{li.unit}{/if}
								</span>
								{#if hasTax && li.taxable === false}
									<span class="quote-doc__line-taxexempt">
										<i class="ri-price-tag-3-line" aria-hidden="true"></i>Tax exempt
									</span>
								{/if}
								{#if li.photos}{@render photoThumbs(li.photos)}{/if}
							</span>
							<span class="quote-doc__optional-price">+{formatCurrency(li.total)}</span>
						</label>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Totals -->
	<div class="quote-doc__totals-card">
		{#if isTiered && selectedPkg}
			<div class="quote-doc__totals-pkg">
				<i class="ri-price-tag-3-line" aria-hidden="true" style="color: var(--brand);"></i>
				<span>Selected package: <strong>{selectedPkg.name}</strong></span>
			</div>
		{/if}
		<div class="quote-doc__totals-row">
			<span class="quote-doc__totals-term">Subtotal</span>
			<span class="quote-doc__totals-value">{formatCurrency(liveTotals.subtotal)}</span>
		</div>
		{#if liveTotals.discount > 0}
			<div class="quote-doc__totals-row">
				<span class="quote-doc__totals-term quote-doc__totals-term--discount">{discountText}</span>
				<span class="quote-doc__totals-value quote-doc__totals-value--discount">−{formatCurrency(liveTotals.discount)}</span>
			</div>
		{/if}
		<div class="quote-doc__totals-row">
			<span class="quote-doc__totals-term">Tax ({taxPct})</span>
			<span class="quote-doc__totals-value">{formatCurrency(liveTotals.tax)}</span>
		</div>
		<div
			class="quote-doc__totals-grand"
			style="background-color: color-mix(in srgb, var(--brand) 10%, transparent);"
		>
			<span style="color: var(--color-text-primary);">Total</span>
			<span style="color: var(--brand); font-variant-numeric: tabular-nums;">{formatCurrency(liveTotals.total)}</span>
		</div>
		{#if quote.deposit_required && liveDepositAmount}
			<p class="quote-doc__totals-deposit-note">
				{depositLabel} {formatCurrency(liveDepositAmount)} is required to start.
			</p>
		{/if}
	</div>

	{#if quote.notes}
		<div class="quote-doc__notes">{quote.notes}</div>
	{/if}

	<!-- Terms & Conditions (per-quote fine print, frozen from the org default) -->
	{#if quote.terms}
		<div class="quote-doc__terms">
			<div class="quote-doc__terms-header">
				<i class="ri-file-text-line" aria-hidden="true"></i>
				<p class="quote-doc__terms-heading">Terms &amp; Conditions</p>
			</div>
			<div class="quote-doc__terms-body">{quote.terms}</div>
		</div>
	{/if}

	<!-- Business signature block (org-level "Authorized by" credential) -->
	{#if quote.signature_block_enabled && quote.signature_name}
		<div class="quote-doc__signature">
			<div class="quote-doc__signature-header">
				<i class="ri-edit-line" aria-hidden="true"></i>
				<p class="quote-doc__signature-heading">Authorized by</p>
			</div>
			{#if quote.signature_image_url}
				<img
					class="quote-doc__signature-image"
					src={quote.signature_image_url}
					alt="Authorized signature"
				/>
			{/if}
			<p class="quote-doc__signature-name">
				{quote.signature_name}{#if quote.signature_title}<span class="quote-doc__signature-title">
						· {quote.signature_title}</span
					>{/if}
			</p>
			{#if quote.signature_statement}
				<p class="quote-doc__signature-statement">{quote.signature_statement}</p>
			{/if}
		</div>
	{/if}

	<!-- Action area — injected by the parent (live accept/decline/pay, or inert preview) -->
	{@render actions?.()}

	<p class="quote-doc__footer">
		This quote was sent to you by {quote.org_name}.
		{#if quote.expires_at}
			It expires {new Date(quote.expires_at).toLocaleDateString('en-US')}.
		{/if}
	</p>
</div>

<Dialog.Root open={lightbox !== null} onOpenChange={(o) => !o && (lightbox = null)}>
	<Dialog.Content class="quote-doc-lightbox">
		{#if lightbox && lightbox.photos[lightbox.index]}
			<div class="quote-doc-lightbox__inner">
				<img src={lightbox.photos[lightbox.index].full_url} alt="" />
				{#if lightbox.photos.length > 1}
					<button
						type="button"
						class="quote-doc-lightbox__nav quote-doc-lightbox__nav--prev"
						onclick={() => lightboxStep(-1)}
						aria-label="Previous photo"
					>
						<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
					</button>
					<button
						type="button"
						class="quote-doc-lightbox__nav quote-doc-lightbox__nav--next"
						onclick={() => lightboxStep(1)}
						aria-label="Next photo"
					>
						<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
