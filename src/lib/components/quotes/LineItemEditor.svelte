<script lang="ts">
	import type { DndEvent } from 'svelte-dnd-action';
	import { lazyDndzone } from '$lib/actions/lazyDndzone';
	import { flip } from 'svelte/animate';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import UnitCombobox from './UnitCombobox.svelte';
	import LineItemPhotos from './LineItemPhotos.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import {
		Trash2,
		Plus,
		BookOpen,
		BookmarkPlus,
		BookmarkCheck,
		GripVertical,
		ArrowUp,
		ArrowDown,
		Layers,
		Gift,
		X
	} from '@lucide/svelte';
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
		// When true the parent renders the "Add from price book" trigger itself and
		// the internal button is hidden. Use bind:catalogOpen to wire them up.
		externalCatalogTrigger = false,
		catalogOpen = $bindable(false),
		// Quotes turn this on for per-line photos (thumbnails + lightbox). Needs the quote id
		// and the photos already loaded for the quote, grouped by line_key.
		enablePhotos = false,
		quoteId = '',
		photosByLineKey = {},
		canEditPhotos = false
	}: {
		lineItems?: QuoteLineDraft[];
		readonly?: boolean;
		enableCatalog?: boolean;
		enableOptional?: boolean;
		externalCatalogTrigger?: boolean;
		catalogOpen?: boolean;
		enablePhotos?: boolean;
		quoteId?: string;
		photosByLineKey?: Record<string, QuoteLinePhoto[]>;
		canEditPhotos?: boolean;
	} = $props();

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
		el.classList.add('shadow-xl', 'opacity-95');
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

	// Shared grid template so the column headers line up exactly with each row:
	// grip · item(title) · qty · unit · unit price · total · actions
	const gridCols = 'md:grid-cols-[20px_minmax(0,1fr)_64px_84px_112px_96px_84px]';
</script>

<div class="space-y-3">
	{#if enableCatalog && !readonly && !externalCatalogTrigger}
		<div class="flex justify-end">
			<Button variant="outline" size="sm" class="gap-1.5" onclick={() => (catalogOpen = true)}>
				<BookOpen class="h-4 w-4" />Add from price book
			</Button>
		</div>
	{/if}

	{#each sections as sec (sec.id)}
		<div class="space-y-2">
			{#if sec.label !== null}
				<!-- Section heading -->
				<div class="flex items-center gap-2">
					{#if !readonly}
						<div class="flex shrink-0 items-center">
							<button
								type="button"
								class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
								aria-label="Move section up"
								onclick={() => moveSection(sec, -1)}
							>
								<ArrowUp class="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
								aria-label="Move section down"
								onclick={() => moveSection(sec, 1)}
							>
								<ArrowDown class="h-3.5 w-3.5" />
							</button>
						</div>
						<Input
							value={sec.label}
							placeholder="Section name"
							class="h-8 flex-1 font-semibold"
							oninput={(e: Event) =>
								renameSection(sec, (e.currentTarget as HTMLInputElement).value)}
						/>
						<button
							type="button"
							class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
							aria-label="Remove section"
							title="Remove section (items move to ungrouped)"
							onclick={() => deleteSection(sec)}
						>
							<X class="h-4 w-4" />
						</button>
					{:else}
						<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground">
							{sec.label}
						</h3>
					{/if}
				</div>
			{/if}

			<!-- Column headers — desktop only, shown once on the first section -->
			{#if sec === sections[0] && (sec.items.length > 0 || !readonly)}
				<div class="hidden gap-x-3 px-1 pb-0.5 md:grid {gridCols}">
					<span></span>
					<span class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
						>Item</span
					>
					<span
						class="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
						>Qty</span
					>
					<span class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
						>Unit</span
					>
					<span class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
						>Unit price</span
					>
					<span
						class="pr-1 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground"
						>Total</span
					>
					<span></span>
				</div>
			{/if}

			<!-- Draggable item list (drop target even when empty) -->
			<div
				class="flex min-h-[44px] flex-col gap-2"
				use:lazyDndzone={{
					items: sec.items,
					type: 'quote-line',
					dropTargetStyle: {},
					dropTargetClasses: ['ring-2', 'ring-primary/40', 'rounded-lg', 'bg-primary/5'],
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
						class="rounded-xl border p-3 shadow-sm transition-colors {li.is_optional
							? 'border-dashed border-amber-400/70 bg-amber-50/40 dark:border-amber-500/40 dark:bg-amber-500/5'
							: 'border-border/60 bg-card hover:border-border'}"
					>
						<!-- ── Desktop layout ───────────────────────────────────── -->
						<div class="hidden md:block">
							<div class="grid items-start gap-x-3 {gridCols}">
								{#if !readonly}
									<span
										class="flex h-9 cursor-grab items-center justify-center text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing"
									>
										<GripVertical class="h-4 w-4" />
									</span>
								{:else}
									<span></span>
								{/if}
								<Input
									value={li.description}
									disabled={readonly}
									placeholder="Item name"
									class="h-9 font-medium"
									oninput={(e: Event) =>
										updateField(li.client_id, {
											description: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<Input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="h-9 text-center"
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
								<Input
									type="number"
									inputmode="decimal"
									min="0"
									step="0.01"
									class="h-9"
									value={li.unit_price}
									disabled={readonly}
									oninput={(e: Event) =>
										updateField(li.client_id, {
											unit_price: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<div class="flex h-9 flex-col items-end justify-center leading-tight">
									<span
										class="text-sm font-semibold tabular-nums {li.is_optional
											? 'text-muted-foreground'
											: 'text-foreground'}"
									>
										{formatCurrency(lineTotal(li))}
									</span>
									{#if li.is_optional}
										<span
											class="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
											>Optional</span
										>
									{/if}
								</div>
								<div class="flex h-9 items-center justify-end gap-0.5">
									{#if enableOptional && !readonly}{@render optionalBtn(li)}{/if}
									{#if enableCatalog && !readonly}{@render bookmarkBtn(li)}{/if}
									{#if !readonly}
										<button
											type="button"
											class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
											onclick={() => removeItem(li.client_id)}
											aria-label="Remove line item"
										>
											<Trash2 class="h-4 w-4" />
										</button>
									{/if}
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
									class="mt-2 flex min-h-8 w-[calc(100%-32px)] resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ml-8"
								></textarea>
							{:else if li.details && li.details.trim()}
								<p class="ml-8 mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
									{li.details}
								</p>
							{/if}
						</div>

						<!-- ── Mobile layout ────────────────────────────────────── -->
						<div class="space-y-2.5 md:hidden">
							<div class="flex items-center justify-between gap-2">
								{#if !readonly}
									<span class="cursor-grab text-muted-foreground active:cursor-grabbing">
										<GripVertical class="h-4 w-4" />
									</span>
								{:else}
									<span></span>
								{/if}
								<div class="flex items-center gap-1">
									<div class="text-right leading-tight">
										<span
											class="text-sm font-semibold tabular-nums {li.is_optional
												? 'text-muted-foreground'
												: 'text-foreground'}"
										>
											{formatCurrency(lineTotal(li))}
										</span>
										{#if li.is_optional}
											<span
												class="block text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
												>Optional</span
											>
										{/if}
									</div>
									{#if enableOptional && !readonly}{@render optionalBtn(li)}{/if}
									{#if enableCatalog && !readonly}{@render bookmarkBtn(li)}{/if}
									{#if !readonly}
										<button
											type="button"
											class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
											onclick={() => removeItem(li.client_id)}
											aria-label="Remove line item"
										>
											<Trash2 class="h-4 w-4" />
										</button>
									{/if}
								</div>
							</div>

							<Input
								value={li.description}
								disabled={readonly}
								placeholder="Item name"
								class="font-medium"
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
									class="flex min-h-8 w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								></textarea>
							{:else if li.details && li.details.trim()}
								<p class="whitespace-pre-wrap text-sm text-muted-foreground">{li.details}</p>
							{/if}

							<div class="grid grid-cols-12 gap-2">
								<div class="col-span-3">
									<Input
										type="number"
										inputmode="decimal"
										min="0"
										step="0.01"
										value={li.quantity}
										disabled={readonly}
										placeholder="Qty"
										oninput={(e: Event) =>
											updateField(li.client_id, {
												quantity: (e.currentTarget as HTMLInputElement).value
											})}
									/>
								</div>
								<div class="col-span-4">
									<UnitCombobox
										value={li.unit}
										disabled={readonly}
										onValueChange={(v) => updateField(li.client_id, { unit: v })}
									/>
								</div>
								<div class="col-span-5">
									<Input
										type="number"
										inputmode="decimal"
										min="0"
										step="0.01"
										value={li.unit_price}
										disabled={readonly}
										placeholder="Unit price"
										oninput={(e: Event) =>
											updateField(li.client_id, {
												unit_price: (e.currentTarget as HTMLInputElement).value
											})}
									/>
								</div>
							</div>
						</div>

						<!-- Per-line photos — rendered once, aligned under the title on desktop -->
						{#if enablePhotos}
							<div class="md:pl-8">
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
				<button
					type="button"
					class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/30 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={() => addBlankItem(sec)}
				>
					<Plus class="h-3.5 w-3.5" />Add item{sec.label !== null ? ` to ${sec.label}` : ''}
				</button>
			{/if}

			{#if sec.label !== null && sec.items.length > 0}
				<div class="flex justify-end px-1 text-sm">
					<span class="text-muted-foreground">{sec.label} subtotal</span>
					<span class="ml-3 font-semibold tabular-nums text-foreground"
						>{formatCurrency(sectionSubtotal(sec))}</span
					>
				</div>
			{/if}
		</div>
	{/each}

	{#if !readonly}
		<div class="flex flex-wrap gap-2 pt-1">
			{#if sections.length === 0}
				<Button variant="outline" size="sm" onclick={addItemToEnd}>
					<Plus class="mr-1 h-4 w-4" />Add item
				</Button>
			{/if}
			<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={addSection}>
				<Layers class="mr-1 h-4 w-4" />Add section
			</Button>
		</div>
	{/if}
</div>

{#snippet optionalBtn(li: LineRow)}
	<button
		type="button"
		class="rounded-md p-1.5 transition-colors hover:bg-muted {li.is_optional
			? 'text-amber-600 dark:text-amber-400'
			: 'text-muted-foreground hover:text-amber-600'}"
		onclick={() => toggleOptional(li.client_id)}
		aria-pressed={li.is_optional}
		aria-label="Mark as optional add-on"
		title={li.is_optional
			? 'Optional add-on — customer can choose this. Click to make required.'
			: 'Make this an optional add-on the customer can choose'}
	>
		<Gift class="h-4 w-4" />
	</button>
{/snippet}

{#snippet bookmarkBtn(li: LineRow)}
	{#if li.source_catalog_item_id}
		<span
			class="flex items-center justify-center rounded-md p-1.5 text-emerald-600 dark:text-emerald-400"
			title="Saved in your price book"
		>
			<BookmarkCheck class="h-4 w-4" />
		</span>
	{:else}
		<button
			type="button"
			class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-40"
			onclick={() => openSaveToCatalog(li.client_id)}
			disabled={!li.description.trim() || !li.unit_price.trim()}
			aria-label="Save to price book"
			title="Save to price book"
		>
			<BookmarkPlus class="h-4 w-4" />
		</button>
	{/if}
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
