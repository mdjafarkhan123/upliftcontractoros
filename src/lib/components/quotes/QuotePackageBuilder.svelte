<script lang="ts">
	import LineItemEditor from './LineItemEditor.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuotePackageDraft, QuoteLinePhoto, QuoteLineDraft } from '$lib/types/quotes';

	let {
		packages = $bindable<QuotePackageDraft[]>([]),
		readonly = false,
		quoteId = '',
		photosByLineKey = {},
		canEditPhotos = false,
		showCost = false,
		targetMarginPct = null,
		enableTax = false
	}: {
		packages?: QuotePackageDraft[];
		readonly?: boolean;
		quoteId?: string;
		photosByLineKey?: Record<string, QuoteLinePhoto[]>;
		canEditPhotos?: boolean;
		showCost?: boolean;
		targetMarginPct?: string | number | null;
		enableTax?: boolean;
	} = $props();

	// Canonical Good-Better-Best tier names (ServiceTitan / Housecall convention).
	const TIER_NAMES = ['Good', 'Better', 'Best'];

	// A package's base price = sum of its required (non-optional) lines. Optional add-ons are
	// excluded here — they only add to the customer's total if selected at acceptance.
	function pkgSubtotal(lines: QuoteLineDraft[]): number {
		return lines.reduce((s, li) => {
			if (li.is_optional) return s;
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0);
	}

	function addPackage() {
		if (readonly || packages.length >= 3) return;
		const name = TIER_NAMES[packages.length] ?? `Option ${packages.length + 1}`;
		packages = [
			...packages,
			{
				client_id: crypto.randomUUID(),
				package_key: crypto.randomUUID(),
				name,
				is_recommended: false,
				lines: []
			}
		];
	}

	function removePackage(clientId: string) {
		if (readonly || packages.length <= 2) return;
		const wasRecommended = packages.find((p) => p.client_id === clientId)?.is_recommended ?? false;
		packages = packages.filter((p) => p.client_id !== clientId);
		// Never leave a tiered quote without a recommended tier.
		if (wasRecommended && packages.length > 0 && !packages.some((p) => p.is_recommended)) {
			packages[0].is_recommended = true;
		}
	}

	function setRecommended(clientId: string) {
		if (readonly) return;
		for (const p of packages) p.is_recommended = p.client_id === clientId;
	}
</script>

<div class="pkg-builder">
	{#each packages as pkg, i (pkg.client_id)}
		<div class="pkg-builder__pkg" class:pkg-builder__pkg--recommended={pkg.is_recommended}>
			<div class="pkg-builder__pkg-head">
				<div class="pkg-builder__pkg-title">
					<span class="pkg-builder__pkg-badge">Option {i + 1}</span>
					<input
						class="pkg-builder__name-input"
						bind:value={packages[i].name}
						maxlength="60"
						placeholder="Package name"
						disabled={readonly}
						aria-label="Package name"
					/>
				</div>
				<div class="pkg-builder__pkg-meta">
					<span class="pkg-builder__pkg-price">{formatCurrency(pkgSubtotal(pkg.lines))}</span>
					<label class="pkg-builder__rec-toggle">
						<input
							type="radio"
							name="recommended-package"
							checked={pkg.is_recommended}
							disabled={readonly}
							onchange={() => setRecommended(pkg.client_id)}
						/>
						<i class={pkg.is_recommended ? 'ri-star-fill' : 'ri-star-line'} aria-hidden="true"></i>
						<span>Recommended</span>
					</label>
					{#if !readonly && packages.length > 2}
						<button
							type="button"
							class="pkg-builder__remove"
							title="Remove package"
							aria-label="Remove package"
							onclick={() => removePackage(pkg.client_id)}
						>
							<i class="ri-delete-bin-line" aria-hidden="true"></i>
						</button>
					{/if}
				</div>
			</div>

			<div class="pkg-builder__pkg-body">
				<LineItemEditor
					bind:lineItems={packages[i].lines}
					{readonly}
					enableCatalog
					enableOptional
					{enableTax}
					enablePhotos
					{quoteId}
					{photosByLineKey}
					{canEditPhotos}
					{showCost}
					{targetMarginPct}
				/>
			</div>
		</div>
	{/each}

	{#if !readonly && packages.length < 3}
		<button type="button" class="pkg-builder__add" onclick={addPackage}>
			<i class="ri-add-line" aria-hidden="true"></i>
			<span>Add package</span>
		</button>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.pkg-builder {
		display: flex;
		flex-direction: column;
		gap: $space-5;

		&__pkg {
			border: 1px solid var(--color-border);
			border-radius: $radius-lg;
			background: var(--color-bg-surface);
			overflow: hidden;

			&--recommended {
				border-color: var(--color-brand);
				box-shadow: 0 0 0 1px var(--color-brand);
			}
		}

		&__pkg-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-4;
			flex-wrap: wrap;
			padding: $space-4;
			background: var(--color-bg-surface-sunk);
			border-bottom: 1px solid var(--color-border-subtle);
		}

		&__pkg-title {
			display: flex;
			align-items: center;
			gap: $space-3;
			min-width: 0;
			flex: 1 1 auto;
		}

		&__pkg-badge {
			flex-shrink: 0;
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			letter-spacing: $tracking-label;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		&__name-input {
			flex: 1 1 auto;
			min-width: 0;
			max-width: 260px;
			border: 1px solid transparent;
			border-radius: $radius-sm;
			background: transparent;
			padding: $space-2 $space-3;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);

			&:hover:not(:disabled) {
				border-color: var(--color-border);
				background: var(--color-bg-surface);
			}

			&:focus {
				outline: none;
				border-color: var(--color-brand);
				background: var(--color-bg-surface);
			}
		}

		&__pkg-meta {
			display: flex;
			align-items: center;
			gap: $space-4;
			flex-shrink: 0;
		}

		&__pkg-price {
			font-size: $fs-body;
			font-weight: $weight-bold;
			color: var(--color-text-primary);
		}

		&__rec-toggle {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-secondary);
			cursor: pointer;

			input {
				position: absolute;
				opacity: 0;
				pointer-events: none;
			}

			i {
				font-size: 1.6rem;
				color: var(--color-text-muted);
				transition: color $duration-fast $ease-standard;
			}

			&:has(input:checked) {
				color: var(--color-brand-strong);

				i {
					color: var(--color-brand);
				}
			}
		}

		&__remove {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border: 1px solid var(--color-border);
			border-radius: $radius-sm;
			background: var(--color-bg-surface);
			color: var(--color-text-muted);
			cursor: pointer;
			transition: all $duration-fast $ease-standard;

			&:hover {
				border-color: var(--danger-solid);
				color: var(--danger-solid);
			}

			i {
				font-size: 1.6rem;
			}
		}

		&__pkg-body {
			padding: $space-4;
		}

		&__add {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: $space-2;
			align-self: flex-start;
			padding: $space-3 $space-5;
			border: 1px dashed var(--color-border-strong);
			border-radius: $radius-full;
			background: transparent;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-brand-strong);
			cursor: pointer;
			transition: all $duration-fast $ease-standard;

			&:hover {
				border-color: var(--color-brand);
				background: var(--color-bg-surface-sunk);
			}

			i {
				font-size: 1.6rem;
			}
		}
	}
</style>
