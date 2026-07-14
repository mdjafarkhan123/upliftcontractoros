<script lang="ts" module>
	export type ListTab<T extends string = string> = {
		value: T;
		label: string;
		/** Shown as a pill badge after the label when > 0. */
		count?: number;
	};
</script>

<script lang="ts" generics="T extends string">
	let {
		tabs,
		value = $bindable(),
		onChange,
		ariaLabel = 'Filter'
	}: {
		tabs: ListTab<T>[];
		value: T;
		onChange?: (next: T) => void;
		ariaLabel?: string;
	} = $props();

	function set(next: T) {
		value = next;
		onChange?.(next);
	}
</script>

<div class="list-tabs" role="tablist" aria-label={ariaLabel}>
	{#each tabs as tab (tab.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === tab.value}
			onclick={() => set(tab.value)}
			class="list-tabs__tab"
			class:list-tabs__tab--active={value === tab.value}
		>
			{tab.label}
			{#if tab.count && tab.count > 0}
				<span class="list-tabs__count">{tab.count}</span>
			{/if}
		</button>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// The one list-page tab bar for every entity (Contacts, Quotes, Jobs,
	// Invoices…). Underline style — the HubSpot / Jobber list standard.
	.list-tabs {
		display: flex;
		overflow-x: auto;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}

		&__tab {
			position: relative;
			flex-shrink: 0;
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			min-height: 44px;
			margin-bottom: -1px;
			padding: $space-2 $space-4;
			border: none;
			border-bottom: 2px solid transparent;
			background: transparent;
			color: var(--color-text-secondary);
			font-size: $fs-body;
			font-weight: $weight-medium;
			white-space: nowrap;
			cursor: pointer;
			transition:
				color $duration-fast $ease-standard,
				border-color $duration-fast $ease-standard;

			&:hover {
				color: var(--color-text-primary);
				border-bottom-color: var(--color-border);
			}
			&:focus-visible {
				outline: none;
				box-shadow: inset 0 0 0 2px var(--color-brand);
			}

			&--active {
				color: var(--color-text-primary);
				border-bottom-color: var(--color-brand);
				&:hover {
					border-bottom-color: var(--color-brand);
				}
			}
		}

		&__count {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 1.25rem;
			padding: 1px $space-1;
			border-radius: $radius-full;
			background: var(--color-bg-surface-sunk);
			color: var(--color-text-secondary);
			font-size: $fs-body;
			font-weight: $weight-semibold;
			font-variant-numeric: tabular-nums;
		}

		&__tab--active &__count {
			background: rgba(34, 125, 83, 0.1);
			color: var(--color-brand);
		}
	}
</style>
