<script lang="ts">
	import type { DndEvent } from 'svelte-dnd-action';
	import { lazyDndzone } from '$lib/actions/lazyDndzone';
	import { flip } from 'svelte/animate';
	import UnitCombobox from './UnitCombobox.svelte';
	import LineItemPhotos from './LineItemPhotos.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteLineDraft, CatalogItem, QuoteLinePhoto } from '$lib/types/quotes';

	function autoResize(node: HTMLTextAreaElement) {
		function resize() {
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
		}
		node.addEventListener('input', resize);
		resize();
		return { destroy: () => node.removeEventListener('input', resize) };
	}

	let {
		lineItems = $bindable<QuoteLineDraft[]>([]),
		readonly = false,
		// Quotes turn this on to get the price-book picker + save-to-catalog. Invoices leave
		// it off (invoice lines have no catalog link).
		enableCatalog = false,
		// Quotes/templates turn this on for the per-line "Optional add-on" toggle. Invoices
		// leave it off (invoice lines are never optional).
		enableOptional = false,
		// Quotes/templates/invoices turn this on for the per-line "Tax" toggle (QuickBooks/Jobber
		// model — the quote's single tax rate applies only to taxable lines). Off = no toggle and
		// the line's taxable flag is left untouched (defaults true).
		enableTax = false,
		// When true the parent renders the "Add from price book" trigger itself and
		// the internal button is hidden. Use bind:catalogOpen to wire them up.
		externalCatalogTrigger = false,
		catalogOpen = $bindable(false),
		// Quotes turn this on for per-line photos (thumbnails + lightbox). Needs the quote id
		// and the photos already loaded for the quote, grouped by line_key.
		enablePhotos = false,
		quoteId = '',
		photosByLineKey = {},
		canEditPhotos = false,
		// Revenue-only: shows the internal per-line unit-cost input + profit/margin panel.
		// Cost is private (never on public quote/PDF/invoice) — gate on can_view_revenue.
		showCost = false,
		// The org's target profit-margin % (from settings). Drives the green/amber/red signal
		// on the margin readouts. Null/blank = no target set → readouts stay neutral (no color).
		// Arrives from the numeric DB column as a string; parsed to a number below.
		targetMarginPct = null,
		// When true the internal "Add from price book" bar and the "Add item / Add section"
		// footer are hidden — the parent hosts those buttons in its own header and drives them
		// via `bind:catalogOpen` and the bindable `controls` below (job detail does this).
		hoistActions = false,
		// Bindable handle exposing the add-item / add-section actions so a parent can put those
		// buttons wherever it wants (e.g. a section header). Set from inside once functions exist.
		controls = $bindable(undefined)
	}: {
		lineItems?: QuoteLineDraft[];
		readonly?: boolean;
		enableCatalog?: boolean;
		enableOptional?: boolean;
		enableTax?: boolean;
		externalCatalogTrigger?: boolean;
		catalogOpen?: boolean;
		enablePhotos?: boolean;
		quoteId?: string;
		photosByLineKey?: Record<string, QuoteLinePhoto[]>;
		canEditPhotos?: boolean;
		showCost?: boolean;
		targetMarginPct?: string | number | null;
		hoistActions?: boolean;
		controls?: { addItem: () => void; addSection: () => void } | undefined;
	} = $props();

	// ── Cost view + target (internal, revenue-only) ─────────────────────────────
	// Contractors think in either margin (profit ÷ price) or markup (profit ÷ cost);
	// ServiceTitan/Housecall let you flip between them. Preference is remembered locally.
	type CostView = 'margin' | 'markup';
	function readCostView(): CostView {
		if (typeof localStorage === 'undefined') return 'margin';
		const saved = localStorage.getItem('quote-cost-view');
		return saved === 'markup' ? 'markup' : 'margin';
	}
	let costView = $state<CostView>(readCostView());
	function setCostView(v: CostView) {
		costView = v;
		if (typeof localStorage !== 'undefined') localStorage.setItem('quote-cost-view', v);
	}

	// The target margin floor as a number, or null when unset (color signal off).
	const target = $derived.by(() => {
		const n = Number(targetMarginPct);
		return targetMarginPct != null && targetMarginPct !== '' && Number.isFinite(n) ? n : null;
	});

	// Traffic-light tone for a margin %. Green ≥ target, amber within 10 points below,
	// red beyond that. Always judged on MARGIN (the target is a margin floor), even when
	// the readout is displayed as markup. No target or no value = no color.
	function marginTone(marginPct: number | null): '' | 'good' | 'warn' | 'bad' {
		if (target == null || marginPct == null) return '';
		if (marginPct >= target) return 'good';
		if (marginPct >= target - 10) return 'warn';
		return 'bad';
	}

	// ── Section model ──────────────────────────────────────────────────────────
	// The editor's working state is a list of sections, each holding line rows. A row
	// carries an `id` (mirrors client_id) purely so svelte-dnd-action can track it.
	// `label: null` = the ungrouped catch-all. The flat `lineItems` bindable stays the
	// authoritative output the parent reads; we sync sections → lineItems on every change
	// and rebuild sections only when lineItems changes from OUTSIDE (template apply etc.).
	type LineRow = QuoteLineDraft & { id: string };
	type Section = { id: string; label: string | null; items: LineRow[] };

	let sections = $state<Section[]>([]);
	// Non-reactive guard: signature (ids + section membership + order) of the flat list we
	// last produced. Lets the inbound effect skip rebuilding sections for our own writes.
	let lastSig = '';

	function sigOf(items: { client_id: string; section_label?: string | null }[]): string {
		return items.map((i) => `${i.client_id}#${i.section_label ?? ''}`).join('|');
	}

	function buildSections(items: QuoteLineDraft[]): Section[] {
		const secs: Section[] = [];
		for (const it of items) {
			const label = it.section_label ?? null;
			let sec = secs.find((s) => s.label === label);
			if (!sec) {
				sec = { id: crypto.randomUUID(), label, items: [] };
				secs.push(sec);
			}
			sec.items.push({ ...it, id: it.client_id });
		}
		return secs;
	}

	$effect(() => {
		const incoming = lineItems;
		const s = sigOf(incoming);
		if (s !== lastSig) {
			sections = buildSections(incoming);
			lastSig = s;
		}
	});

	// Flatten sections → lineItems, stamping each row with its section's label and
	// keeping a section's rows contiguous so order reconstructs from `position` on reload.
	function commit() {
		const flat: QuoteLineDraft[] = [];
		for (const sec of sections) {
			for (const it of sec.items) {
				flat.push({
					client_id: it.client_id,
					line_key: it.line_key ?? it.client_id,
					description: it.description,
					details: it.details ?? null,
					quantity: it.quantity,
					unit: it.unit,
					section_label: sec.label,
					is_optional: it.is_optional ?? false,
					taxable: it.taxable ?? true,
					unit_price: it.unit_price,
					unit_cost: it.unit_cost,
					source_catalog_item_id: it.source_catalog_item_id
				});
			}
		}
		lastSig = sigOf(flat);
		lineItems = flat;
	}

	function lineTotal(li: LineRow): number {
		const q = Number(li.quantity);
		const p = Number(li.unit_price);
		if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
		return Math.round(q * p * 100) / 100;
	}

	// Per-section subtotal counts REQUIRED items only — optional add-ons are not part of
	// the firm price the customer commits to up front.
	function sectionSubtotal(sec: Section): number {
		return (
			Math.round(sec.items.reduce((s, li) => s + (li.is_optional ? 0 : lineTotal(li)), 0) * 100) /
			100
		);
	}

	// ── Cost & margin (internal, revenue-only) ──────────────────────────────────
	// A blank/absent unit_cost is treated as "not set" (not zero) so margin never lies.
	function hasCost(li: LineRow): boolean {
		return li.unit_cost != null && String(li.unit_cost).trim() !== '';
	}

	function lineCost(li: LineRow): number {
		if (!hasCost(li)) return 0;
		const q = Number(li.quantity);
		const c = Number(li.unit_cost);
		if (!Number.isFinite(q) || !Number.isFinite(c)) return 0;
		return Math.round(q * c * 100) / 100;
	}

	// Per-line margin % (profit ÷ price), null when price is 0. Used for the tone signal.
	function lineMarginPct(li: LineRow): number | null {
		const price = lineTotal(li);
		if (price <= 0) return null;
		return Math.round(((price - lineCost(li)) / price) * 100);
	}

	// Per-line readout text, following the margin/markup view. "No cost set" until a cost
	// is entered. Markup = profit ÷ cost (undefined at zero cost → shows margin fallback).
	function marginLabel(li: LineRow): string {
		if (!hasCost(li)) return 'No cost set';
		const price = lineTotal(li);
		const profit = Math.round((price - lineCost(li)) * 100) / 100;
		if (costView === 'markup') {
			const cost = lineCost(li);
			const pct = cost > 0 ? `${Math.round((profit / cost) * 100)}%` : '—';
			return `${pct} markup · ${formatCurrency(profit)} profit`;
		}
		const pct = price > 0 ? `${Math.round((profit / price) * 100)}%` : '—';
		return `${pct} margin · ${formatCurrency(profit)} profit`;
	}

	// Whole-quote profitability over REQUIRED lines only — matches the committed
	// subtotal the customer pays (optional add-ons are excluded, same as subtotals).
	const costSummary = $derived.by(() => {
		let price = 0;
		let cost = 0;
		for (const sec of sections) {
			for (const li of sec.items) {
				if (li.is_optional) continue;
				price += lineTotal(li);
				cost += lineCost(li);
			}
		}
		const totalCost = Math.round(cost * 100) / 100;
		const totalProfit = Math.round((price - cost) * 100) / 100;
		// marginNum is the true margin % (for the tone), regardless of which view is shown.
		const marginNum = price > 0 ? Math.round((totalProfit / price) * 100) : null;
		const marginPct = marginNum != null ? `${marginNum}%` : '—';
		const markupPct = cost > 0 ? `${Math.round((totalProfit / cost) * 100)}%` : '—';
		return { totalCost, totalProfit, marginPct, markupPct, marginNum };
	});

	function newRow(init: Partial<LineRow> = {}): LineRow {
		const cid = crypto.randomUUID();
		return {
			id: cid,
			client_id: cid,
			// New lines get a stable line_key now so any photo attached before the first save
			// binds to the same key the line row will be inserted with.
			line_key: cid,
			description: '',
			details: '',
			quantity: '1',
			unit: '',
			unit_price: '',
			section_label: null,
			is_optional: false,
			taxable: true,
			...init
		};
	}

	function toggleOptional(client_id: string) {
		for (const sec of sections) {
			const f = sec.items.find((i) => i.client_id === client_id);
			if (f) {
				updateField(client_id, { is_optional: !f.is_optional });
				return;
			}
		}
	}

	// Flip a line's taxable flag. Treats absent as taxable (the default), so the first click on
	// an un-stamped line marks it tax-exempt.
	function toggleTax(client_id: string) {
		for (const sec of sections) {
			const f = sec.items.find((i) => i.client_id === client_id);
			if (f) {
				updateField(client_id, { taxable: !(f.taxable ?? true) });
				return;
			}
		}
	}

	function targetSection(): Section {
		if (sections.length === 0) {
			const s: Section = { id: crypto.randomUUID(), label: null, items: [] };
			sections.push(s);
			return s;
		}
		return sections[sections.length - 1];
	}

	function addBlankItem(sec: Section) {
		sec.items.push(newRow());
		commit();
	}

	function addItemToEnd() {
		addBlankItem(targetSection());
	}

	function addSection() {
		sections.push({ id: crypto.randomUUID(), label: 'New section', items: [] });
	}

	// Hand the add-item / add-section actions up to a parent that hosts these buttons itself.
	// Assigned once (the functions are stable); parent reads via bind:controls.
	controls = { addItem: addItemToEnd, addSection };

	function renameSection(sec: Section, value: string) {
		sec.label = value;
		commit();
	}

	function moveSection(sec: Section, dir: -1 | 1) {
		const idx = sections.findIndex((s) => s.id === sec.id);
		const next = idx + dir;
		if (idx < 0 || next < 0 || next >= sections.length) return;
		const copy = [...sections];
		const [s] = copy.splice(idx, 1);
		copy.splice(next, 0, s);
		sections = copy;
		commit();
	}

	function deleteSection(sec: Section) {
		if (sec.items.length > 0) {
			let ung = sections.find((s) => s.label === null);
			if (!ung) {
				ung = { id: crypto.randomUUID(), label: null, items: [] };
				sections.unshift(ung);
			}
			ung.items.push(...sec.items);
		}
		sections = sections.filter((s) => s.id !== sec.id);
		commit();
	}

	function removeItem(client_id: string) {
		for (const sec of sections) {
			const idx = sec.items.findIndex((i) => i.client_id === client_id);
			if (idx >= 0) {
				sec.items.splice(idx, 1);
				break;
			}
		}
		commit();
	}

	function updateField(client_id: string, patch: Partial<LineRow>) {
		for (const sec of sections) {
			const idx = sec.items.findIndex((i) => i.client_id === client_id);
			if (idx >= 0) {
				sec.items[idx] = { ...sec.items[idx], ...patch };
				break;
			}
		}
		commit();
	}

	// ── Drag and drop (svelte-dnd-action) ───────────────────────────────────────
	const flipDuration = 160;

	function transformDraggedElement(el?: HTMLElement) {
		if (!el) return;
		el.classList.add('quote-lines__row--dragging');
		el.style.willChange = 'transform';
		el.style.transition = 'box-shadow 150ms ease-out, opacity 150ms ease-out';
	}

	function itemConsider(secId: string, e: CustomEvent<DndEvent<LineRow>>) {
		const sec = sections.find((s) => s.id === secId);
		if (sec) sec.items = e.detail.items;
	}

	function itemFinalize(secId: string, e: CustomEvent<DndEvent<LineRow>>) {
		const sec = sections.find((s) => s.id === secId);
		if (sec) sec.items = e.detail.items;
		commit();
	}

	// ── Catalog (price book) wiring ──────────────────────────────────────────────
	let saveOpen = $state(false);
	let saveTargetId = $state<string | null>(null);

	const saveTarget = $derived.by(() => {
		if (!saveTargetId) return undefined;
		for (const sec of sections) {
			const f = sec.items.find((i) => i.client_id === saveTargetId);
			if (f) return f;
		}
		return undefined;
	});

	let CatalogPickerSheet = $state<typeof import('./CatalogPickerSheet.svelte').default | null>(
		null
	);
	let SaveToCatalogSheet = $state<typeof import('./SaveToCatalogSheet.svelte').default | null>(
		null
	);
	$effect(() => {
		if (catalogOpen && !CatalogPickerSheet) {
			void import('./CatalogPickerSheet.svelte').then((m) => (CatalogPickerSheet = m.default));
		}
	});
	$effect(() => {
		if (saveOpen && !SaveToCatalogSheet) {
			void import('./SaveToCatalogSheet.svelte').then((m) => (SaveToCatalogSheet = m.default));
		}
	});

	function addFromCatalog(item: CatalogItem) {
		targetSection().items.push(
			newRow({
				description: item.name,
				details: item.description ?? '',
				quantity: '1',
				unit: item.unit ?? '',
				unit_price: Number(item.unit_price).toFixed(2),
				unit_cost: item.unit_cost,
				taxable: item.default_taxable,
				source_catalog_item_id: item.id
			})
		);
		commit();
	}

	function openSaveToCatalog(client_id: string) {
		saveTargetId = client_id;
		saveOpen = true;
	}

	function onSavedToCatalog(catalogItemId: string) {
		if (saveTargetId) {
			updateField(saveTargetId, { source_catalog_item_id: catalogItemId });
		}
		saveTargetId = null;
	}
</script>

<div class="quote-lines {showCost ? 'quote-lines--cost' : ''}">
	{#if enableCatalog && !readonly && !externalCatalogTrigger && !hoistActions}
		<div class="quote-lines__catalog-bar">
			<Button variant="outline" size="sm" onclick={() => (catalogOpen = true)}>
				<i class="ri-book-2-line" aria-hidden="true"></i>Add from price book
			</Button>
		</div>
	{/if}

	{#each sections as sec (sec.id)}
		<div class="quote-lines__section">
			{#if sec.label !== null}
				<!-- Section heading -->
				<div class="quote-lines__section-head">
					{#if !readonly}
						<div class="quote-lines__section-move">
							<button
								type="button"
								class="quote-lines__icon-btn"
								aria-label="Move section up"
								onclick={() => moveSection(sec, -1)}
							>
								<i class="ri-arrow-up-s-line" aria-hidden="true"></i>
							</button>
							<button
								type="button"
								class="quote-lines__icon-btn"
								aria-label="Move section down"
								onclick={() => moveSection(sec, 1)}
							>
								<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
							</button>
						</div>
						<input
							class="quote-lines__section-input"
							value={sec.label}
							placeholder="Section name"
							oninput={(e: Event) =>
								renameSection(sec, (e.currentTarget as HTMLInputElement).value)}
						/>
						<button
							type="button"
							class="quote-lines__icon-btn quote-lines__icon-btn--danger"
							aria-label="Remove section"
							title="Remove section (items move to ungrouped)"
							onclick={() => deleteSection(sec)}
						>
							<i class="ri-close-line" aria-hidden="true"></i>
						</button>
					{:else}
						<h3 class="quote-lines__section-title">{sec.label}</h3>
					{/if}
				</div>
			{/if}

			<!-- Column headers — desktop only, shown once on the first section -->
			{#if sec === sections[0] && (sec.items.length > 0 || !readonly)}
				<div class="quote-lines__headers">
					<span></span>
					<span class="quote-lines__col">Item</span>
					<span class="quote-lines__col quote-lines__col--center">Qty</span>
					<span class="quote-lines__col">Unit</span>
					{#if showCost}
						<span class="quote-lines__col">Cost</span>
					{/if}
					<span class="quote-lines__col">Unit price</span>
					<span class="quote-lines__col quote-lines__col--right">Total</span>
					<span></span>
				</div>
			{/if}

			<!-- Draggable item list (drop target even when empty) -->
			<div
				class="quote-lines__dropzone"
				use:lazyDndzone={{
					items: sec.items,
					type: 'quote-line',
					dropTargetStyle: {},
					dropTargetClasses: ['quote-lines__dropzone--active'],
					dragDisabled: readonly,
					flipDurationMs: flipDuration,
					transformDraggedElement
				}}
				onconsider={(e) => itemConsider(sec.id, e)}
				onfinalize={(e) => itemFinalize(sec.id, e)}
			>
				{#each sec.items as li (li.id)}
					<div
						animate:flip={{ duration: flipDuration }}
						class="quote-lines__row {li.is_optional ? 'quote-lines__row--optional' : ''}"
					>
						<!-- ── Desktop layout ───────────────────────────────────── -->
						<div class="quote-lines__desktop">
							<div class="quote-lines__grid">
								{#if !readonly}
									<span class="quote-lines__grip">
										<i class="ri-draggable" aria-hidden="true"></i>
									</span>
								{:else}
									<span></span>
								{/if}
								<input
									class="quote-lines__input quote-lines__input--strong"
									value={li.description}
									disabled={readonly}
									placeholder="Item name"
									oninput={(e: Event) =>
										updateField(li.client_id, {
											description: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="quote-lines__input quote-lines__input--center"
									value={li.quantity}
									disabled={readonly}
									oninput={(e: Event) =>
										updateField(li.client_id, {
											quantity: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<UnitCombobox
									value={li.unit}
									disabled={readonly}
									placeholder="—"
									onValueChange={(v) => updateField(li.client_id, { unit: v })}
								/>
								{#if showCost}
									<input
										type="number"
										inputmode="decimal"
										min="0"
										step="0.01"
										class="quote-lines__input quote-lines__input--cost"
										value={li.unit_cost ?? ''}
										disabled={readonly}
										placeholder="Cost"
										oninput={(e: Event) =>
											updateField(li.client_id, {
												unit_cost: (e.currentTarget as HTMLInputElement).value || null
											})}
									/>
								{/if}
								<input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="quote-lines__input"
									value={li.unit_price}
									disabled={readonly}
									oninput={(e: Event) =>
										updateField(li.client_id, {
											unit_price: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<div class="quote-lines__total">
									<span
										class="quote-lines__total-value {li.is_optional
											? 'quote-lines__total-value--optional'
											: ''}"
									>
										{formatCurrency(lineTotal(li))}
									</span>
									{#if li.is_optional}
										<span class="quote-lines__optional-tag">Optional</span>
									{/if}
									{#if enableTax && li.taxable === false}
										<span class="quote-lines__tax-tag">Tax exempt</span>
									{/if}
								</div>
								<div class="quote-lines__row-actions">
									{#if !readonly}{@render lineMenu(li)}{/if}
								</div>
							</div>

							<!-- Description (optional) — aligned under the title -->
							{#if !readonly}
								<textarea
									use:autoResize
									value={li.details ?? ''}
									rows={1}
									oninput={(e: Event) =>
										updateField(li.client_id, {
											details: (e.currentTarget as HTMLTextAreaElement).value
										})}
									placeholder="Add a description (optional)"
									class="quote-lines__details quote-lines__details--indent"
								></textarea>
							{:else if li.details && li.details.trim()}
								<p class="quote-lines__details-text quote-lines__details-text--indent">
									{li.details}
								</p>
							{/if}

							{#if showCost && hasCost(li)}
								{@const tone = marginTone(lineMarginPct(li))}
								<p
									class="quote-lines__margin quote-lines__margin--indent {tone
										? `quote-lines__margin--${tone}`
										: ''}"
								>
									{marginLabel(li)}
								</p>
							{/if}
						</div>

						<!-- ── Mobile layout ────────────────────────────────────── -->
						<div class="quote-lines__mobile">
							<div class="quote-lines__mobile-top">
								{#if !readonly}
									<span class="quote-lines__grip">
										<i class="ri-draggable" aria-hidden="true"></i>
									</span>
								{:else}
									<span></span>
								{/if}
								<div class="quote-lines__mobile-actions">
									<div class="quote-lines__total">
										<span
											class="quote-lines__total-value {li.is_optional
												? 'quote-lines__total-value--optional'
												: ''}"
										>
											{formatCurrency(lineTotal(li))}
										</span>
										{#if li.is_optional}
											<span class="quote-lines__optional-tag">Optional</span>
										{/if}
										{#if enableTax && li.taxable === false}
											<span class="quote-lines__tax-tag">Tax exempt</span>
										{/if}
									</div>
									{#if !readonly}{@render lineMenu(li)}{/if}
								</div>
							</div>

							<input
								class="quote-lines__input quote-lines__input--strong"
								value={li.description}
								disabled={readonly}
								placeholder="Item name"
								oninput={(e: Event) =>
									updateField(li.client_id, {
										description: (e.currentTarget as HTMLInputElement).value
									})}
							/>

							{#if !readonly}
								<textarea
									use:autoResize
									value={li.details ?? ''}
									rows={1}
									oninput={(e: Event) =>
										updateField(li.client_id, {
											details: (e.currentTarget as HTMLTextAreaElement).value
										})}
									placeholder="Add a description (optional)"
									class="quote-lines__details"
								></textarea>
							{:else if li.details && li.details.trim()}
								<p class="quote-lines__details-text">{li.details}</p>
							{/if}

							<div
								class="quote-lines__mobile-fields {showCost
									? 'quote-lines__mobile-fields--cost'
									: ''}"
							>
								<input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="quote-lines__input quote-lines__input--center"
									value={li.quantity}
									disabled={readonly}
									placeholder="Qty"
									oninput={(e: Event) =>
										updateField(li.client_id, {
											quantity: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<UnitCombobox
									value={li.unit}
									disabled={readonly}
									onValueChange={(v) => updateField(li.client_id, { unit: v })}
								/>
								{#if showCost}
									<input
										type="number"
										inputmode="decimal"
										min="0"
										step="0.01"
										class="quote-lines__input quote-lines__input--cost"
										value={li.unit_cost ?? ''}
										disabled={readonly}
										placeholder="Cost"
										oninput={(e: Event) =>
											updateField(li.client_id, {
												unit_cost: (e.currentTarget as HTMLInputElement).value || null
											})}
									/>
								{/if}
								<input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="quote-lines__input"
									value={li.unit_price}
									disabled={readonly}
									placeholder="Unit price"
									oninput={(e: Event) =>
										updateField(li.client_id, {
											unit_price: (e.currentTarget as HTMLInputElement).value
										})}
								/>
							</div>

							{#if showCost && hasCost(li)}
								{@const tone = marginTone(lineMarginPct(li))}
								<p class="quote-lines__margin {tone ? `quote-lines__margin--${tone}` : ''}">
									{marginLabel(li)}
								</p>
							{/if}
						</div>

						<!-- Per-line photos — rendered once, aligned under the title on desktop -->
						{#if enablePhotos}
							<div class="quote-lines__photos">
								<LineItemPhotos
									{quoteId}
									lineKey={li.line_key ?? li.client_id}
									initialPhotos={photosByLineKey[li.line_key ?? li.client_id] ?? []}
									canEdit={canEditPhotos && !readonly}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if !readonly}
				<button type="button" class="quote-lines__add" onclick={() => addBlankItem(sec)}>
					<i class="ri-add-line" aria-hidden="true"></i>Add item{sec.label !== null
						? ` to ${sec.label}`
						: ''}
				</button>
			{/if}

			{#if sec.label !== null && sec.items.length > 0}
				<div class="quote-lines__subtotal">
					<span class="quote-lines__subtotal-label">{sec.label} subtotal</span>
					<span class="quote-lines__subtotal-value">{formatCurrency(sectionSubtotal(sec))}</span>
				</div>
			{/if}
		</div>
	{/each}

	{#if showCost && sections.some((s) => s.items.length > 0)}
		{@const panelTone = marginTone(costSummary.marginNum)}
		<div class="quote-lines__margin-panel">
			<div class="quote-lines__margin-panel-head">
				<i class="ri-lock-line" aria-hidden="true"></i>
				<span class="quote-lines__margin-panel-title">Profitability</span>
				<span class="quote-lines__margin-panel-note">Internal — never shown to the customer</span>
				<!-- Margin ⇄ Markup toggle: same profit, two lenses (ServiceTitan/Housecall). -->
				<div class="quote-lines__cost-view" role="group" aria-label="Profit view">
					<button
						type="button"
						class="quote-lines__cost-view-btn {costView === 'margin'
							? 'quote-lines__cost-view-btn--active'
							: ''}"
						aria-pressed={costView === 'margin'}
						onclick={() => setCostView('margin')}
					>
						Margin
					</button>
					<button
						type="button"
						class="quote-lines__cost-view-btn {costView === 'markup'
							? 'quote-lines__cost-view-btn--active'
							: ''}"
						aria-pressed={costView === 'markup'}
						onclick={() => setCostView('markup')}
					>
						Markup
					</button>
				</div>
			</div>
			<div class="quote-lines__margin-panel-grid">
				<div class="quote-lines__margin-stat">
					<span class="quote-lines__margin-stat-label">Total cost</span>
					<span class="quote-lines__margin-stat-value">{formatCurrency(costSummary.totalCost)}</span
					>
				</div>
				<div class="quote-lines__margin-stat">
					<span class="quote-lines__margin-stat-label">Profit</span>
					<span class="quote-lines__margin-stat-value"
						>{formatCurrency(costSummary.totalProfit)}</span
					>
				</div>
				<div class="quote-lines__margin-stat">
					<span class="quote-lines__margin-stat-label"
						>{costView === 'markup' ? 'Markup' : 'Margin'}</span
					>
					<span
						class="quote-lines__margin-stat-value {panelTone
							? `quote-lines__margin-stat-value--${panelTone}`
							: ''}"
					>
						{costView === 'markup' ? costSummary.markupPct : costSummary.marginPct}
					</span>
				</div>
			</div>
			{#if target != null && panelTone === 'bad'}
				<p class="quote-lines__margin-panel-alert">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					Below your {target}% target margin
				</p>
			{/if}
		</div>
	{/if}

	{#if !readonly && !hoistActions}
		<div class="quote-lines__footer">
			{#if sections.length === 0}
				<Button variant="outline" size="sm" onclick={addItemToEnd}>
					<i class="ri-add-line" aria-hidden="true"></i>Add item
				</Button>
			{/if}
			<Button variant="ghost" size="sm" onclick={addSection}>
				<i class="ri-stack-line" aria-hidden="true"></i>Add section
			</Button>
		</div>
	{/if}
</div>

{#snippet lineMenu(li: LineRow)}
	{@const taxable = li.taxable ?? true}
	<!-- Jobber-style: one quiet "more" button per line holds all the per-line options
	     (tax, optional, save to price book, delete) instead of a cramped row of icons.
	     Menu items are gated by the same flags — invoices only see Taxable + Delete. -->
	<DropdownMenu.Root>
		<DropdownMenu.Trigger class="quote-lines__icon-btn" aria-label="Line item options">
			<i class="ri-more-2-fill" aria-hidden="true"></i>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			{#if enableTax}
				<DropdownMenu.Item closeOnSelect={false} onclick={() => toggleTax(li.client_id)}>
					<i class={taxable ? 'ri-checkbox-line' : 'ri-checkbox-blank-line'} aria-hidden="true"></i>
					Taxable
				</DropdownMenu.Item>
			{/if}
			{#if enableOptional}
				<DropdownMenu.Item closeOnSelect={false} onclick={() => toggleOptional(li.client_id)}>
					<i
						class={li.is_optional ? 'ri-checkbox-line' : 'ri-checkbox-blank-line'}
						aria-hidden="true"
					></i>
					Optional add-on
				</DropdownMenu.Item>
			{/if}
			{#if enableCatalog}
				{#if li.source_catalog_item_id}
					<DropdownMenu.Item disabled>
						<i class="ri-bookmark-fill" aria-hidden="true"></i>
						Saved in price book
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item
						disabled={!li.description.trim() || !li.unit_price.trim()}
						onclick={() => openSaveToCatalog(li.client_id)}
					>
						<i class="ri-bookmark-line" aria-hidden="true"></i>
						Save to price book
					</DropdownMenu.Item>
				{/if}
			{/if}
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onclick={() => removeItem(li.client_id)}>
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
				Delete line
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#if CatalogPickerSheet}
	<CatalogPickerSheet bind:open={catalogOpen} onPick={addFromCatalog} />
{/if}
{#if SaveToCatalogSheet}
	<SaveToCatalogSheet
		bind:open={saveOpen}
		prefill={saveTarget
			? {
					description: saveTarget.description,
					details: saveTarget.details ?? null,
					unit: saveTarget.unit,
					unit_price: saveTarget.unit_price,
					unit_cost: saveTarget.unit_cost
				}
			: undefined}
		onSaved={onSavedToCatalog}
	/>
{/if}
