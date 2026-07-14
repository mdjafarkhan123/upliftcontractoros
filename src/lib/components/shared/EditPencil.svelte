<script lang="ts">
	// Shared round icon-only pencil next to a page/entity title or name.
	// Replaces the near-identical scoped markup + SCSS that was duplicated across
	// detail-page headers (job title, contact name, appointment/quote/invoice
	// headers). `size` matches each site's icon scale; `fade` makes it appear
	// only on parent hover — the parent supplies the reveal rule (see below).
	let {
		onclick,
		ariaLabel,
		size = 'md',
		fade = false
	}: {
		onclick: () => void;
		ariaLabel: string;
		/** 'md' = larger button next to page titles; 'sm' = compact for inline names */
		size?: 'md' | 'sm';
		/** Start hidden and reveal on parent hover. Parent must add:
		 *  `.your-row:hover .edit-pencil--fade { opacity: 1; }` in a GLOBAL partial. */
		fade?: boolean;
	} = $props();
</script>

<button
	type="button"
	class="edit-pencil {size === 'sm' ? 'edit-pencil--sm' : 'edit-pencil--md'}"
	class:edit-pencil--fade={fade}
	aria-label={ariaLabel}
	{onclick}
>
	<i class="ri-pencil-line" aria-hidden="true"></i>
</button>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Jobber-style circular ghost pencil: quiet by default, on hover it lifts into
	// a soft brand-tinted circle with a brand-colored icon.
	.edit-pencil {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: $radius-full;
		transition:
			opacity $duration-fast $ease-standard,
			color $duration-fast $ease-standard,
			background-color $duration-fast $ease-standard;

		i {
			font-size: 1.25rem;
			line-height: 1;
		}

		&:hover {
			color: var(--color-brand);
			background: var(--state-active-tint);
		}

		&:focus-visible {
			outline: 2px solid var(--color-brand);
			outline-offset: 1px;
			color: var(--color-brand);
			background: var(--state-active-tint);
		}
	}

	.edit-pencil--md {
		width: 2.25rem;
		height: 2.25rem;

		i {
			font-size: 1.375rem;
		}
	}

	.edit-pencil--fade {
		opacity: 0;

		&:focus-visible {
			opacity: 1;
		}
	}
</style>
