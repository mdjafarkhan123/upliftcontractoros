<script lang="ts" module>
	export type KpiTone = 'brand' | 'success' | 'info' | 'warn' | 'violet' | 'muted';

	export type KpiTile = {
		/** Stable key for the {#each} block. */
		key: string;
		label: string;
		/** Pre-formatted display value (number, currency, "—", etc.). */
		value: string | number;
		/** Remix icon class, e.g. "ri-time-line". */
		icon: string;
		tone?: KpiTone;
		/** Optional small line under the value. */
		hint?: string;
		/** When set, the tile becomes a filter button. */
		onClick?: () => void;
		/** Highlights the tile as the active filter (orange ring). */
		active?: boolean;
	};
</script>

<script lang="ts">
	let {
		tiles,
		loading = false,
		ariaLabel = 'Stats'
	}: {
		tiles: KpiTile[];
		loading?: boolean;
		ariaLabel?: string;
	} = $props();
</script>

{#snippet tileInner(tile: KpiTile)}
	<div class="kpi-strip__top">
		<span class="kpi-strip__label">{tile.label}</span>
		<span class="kpi-strip__icon kpi-strip__icon--{tile.tone ?? 'muted'}" aria-hidden="true">
			<i class={tile.icon}></i>
		</span>
	</div>
	<div class="kpi-strip__body">
		{#if loading}
			<span class="kpi-strip__skeleton"></span>
		{:else}
			<span class="kpi-strip__value">{tile.value}</span>
		{/if}
		{#if tile.hint}
			<span class="kpi-strip__hint">{tile.hint}</span>
		{/if}
	</div>
{/snippet}

<div class="kpi-strip" style:--kpi-cols={tiles.length} aria-label={ariaLabel}>
	{#each tiles as tile (tile.key)}
		{#if tile.onClick}
			<button
				type="button"
				class="kpi-strip__tile"
				class:kpi-strip__tile--active={tile.active}
				aria-pressed={tile.active ?? false}
				onclick={tile.onClick}
			>
				{@render tileInner(tile)}
			</button>
		{:else}
			<div class="kpi-strip__tile">
				{@render tileInner(tile)}
			</div>
		{/if}
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Shared KPI card strip — Quote-card visuals + Contacts click-to-filter.
	// Mobile: horizontal snap-scroll (handles any tile count). Desktop: even grid.
	.kpi-strip {
		display: flex;
		gap: $space-3;
		overflow-x: auto;
		padding-bottom: $space-1;
		scrollbar-width: none;
		scroll-snap-type: x mandatory;

		&::-webkit-scrollbar {
			display: none;
		}

		@media (min-width: $bp-tablet) {
			display: grid;
			grid-template-columns: repeat(var(--kpi-cols), minmax(0, 1fr));
			overflow: visible;
			padding-bottom: 0;
		}

		&__tile {
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			min-width: 160px;
			min-height: 120px;
			flex-shrink: 0;
			scroll-snap-align: start;
			padding: $space-4;
			border: 1px solid var(--color-border);
			border-radius: $radius-xl;
			background: var(--color-bg-surface);
			box-shadow: var(--shadow-sm);
			text-align: left;
			text-decoration: none;
			font: inherit;
			transition:
				box-shadow $duration-fast $ease-standard,
				border-color $duration-fast $ease-standard;

			@media (min-width: $bp-tablet) {
				min-width: 0;
				min-height: 132px;
				padding: $space-5;
			}
		}

		// Only the filterable tiles (rendered as <button>) react to pointer.
		button.kpi-strip__tile {
			cursor: pointer;

			&:hover {
				box-shadow: var(--shadow-md);
				border-color: rgba(34, 125, 83, 0.3);
			}
			&:focus-visible {
				outline: none;
				box-shadow: var(--shadow-focus);
			}
		}

		&__tile--active {
			border-color: rgba(249, 115, 22, 0.4);
			box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.4);
		}

		&__top {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
		}

		&__label {
			font-size: $fs-body;
			font-weight: $weight-medium;
			line-height: $lh-caption;
			color: var(--color-text-secondary);
		}

		&__icon {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			flex-shrink: 0;
			border-radius: $radius-md;

			i {
				font-size: 2.2rem;
			}

			&--muted {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-secondary);
			}
			&--brand {
				background: rgba(34, 125, 83, 0.1);
				color: var(--color-brand);
			}
			&--success {
				background: rgba(16, 185, 129, 0.1);
				color: #059669;
			}
			&--info {
				background: rgba(14, 165, 233, 0.1);
				color: #0369a1;
			}
			&--warn {
				background: rgba(249, 115, 22, 0.12);
				color: #ea580c;
			}
			&--violet {
				background: rgba(139, 92, 246, 0.1);
				color: #7c3aed;
			}
		}

		&__body {
			display: flex;
			flex-direction: column;
			gap: $space-1;
			margin-top: $space-2;
		}

		&__value {
			font-size: 3rem;
			font-weight: $weight-bold;
			line-height: 1;
			letter-spacing: -0.02em;
			color: var(--color-text-primary);

			@media (min-width: $bp-tablet) {
				font-size: $fs-display;
			}
		}

		&__hint {
			font-size: $fs-caption;
			line-height: $lh-caption;
			color: var(--color-text-muted);
		}

		&__skeleton {
			height: 30px;
			width: 56px;
			border-radius: $radius-sm;
			background: var(--color-bg-surface-sunk);
			animation: kpi-strip-pulse 1.4s ease-in-out infinite;
		}
	}

	@keyframes kpi-strip-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	:root[data-theme='dark'] .kpi-strip__icon {
		&--success {
			color: #34d399;
		}
		&--info {
			color: #7dd3fc;
		}
		&--violet {
			color: #a78bfa;
		}
	}
</style>
