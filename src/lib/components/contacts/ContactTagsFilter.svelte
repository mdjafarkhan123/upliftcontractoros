<script lang="ts">
	import { SUGGESTED_CONTACT_TAGS, formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';

	let {
		value = $bindable<string>(''),
		onChange
	}: {
		value?: string;
		onChange?: (next: string) => void;
	} = $props();

	function set(next: string) {
		value = next === value ? '' : next;
		onChange?.(value);
	}
</script>

<div class="tags-filter" role="group" aria-label="Filter by tag">
	{#each SUGGESTED_CONTACT_TAGS as tag (tag)}
		{@const active = value === tag}
		{@const destructive = isDestructiveTag(tag)}
		<button
			type="button"
			onclick={() => set(tag)}
			aria-pressed={active}
			class="tags-filter__tag"
			class:tags-filter__tag--active={active}
			class:tags-filter__tag--danger={destructive}
		>
			{formatTagLabel(tag)}
		</button>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.tags-filter {
		display: flex;
		gap: $space-2;
		margin: 0 (-$space-1);
		padding: 0 $space-1 $space-1;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}

		&__tag {
			display: inline-flex;
			align-items: center;
			flex-shrink: 0;
			scroll-snap-align: start;
			height: 36px;
			padding: 0 $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-full;
			background: var(--color-bg-surface);
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
			white-space: nowrap;
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard,
				border-color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-primary);
			}

			&--danger {
				border-color: var(--danger-bg);
				background: var(--danger-bg);
				color: var(--danger-text);

				&:hover {
					background: var(--danger-bg);
				}
			}

			&--active {
				border-color: var(--color-brand);
				background: var(--color-brand);
				color: var(--color-text-on-brand);

				&:hover {
					background: var(--color-brand);
					color: var(--color-text-on-brand);
				}
			}

			&--active.tags-filter__tag--danger {
				border-color: var(--danger-solid);
				background: var(--danger-solid);
				color: #fff;

				&:hover {
					background: var(--danger-solid);
				}
			}
		}
	}
</style>
