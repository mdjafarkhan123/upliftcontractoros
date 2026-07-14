<script lang="ts">
	import type { Snippet } from 'svelte';

	// Controlled click-to-edit row. The row itself renders the read-only value with
	// an always-visible pencil, and (when `editing`) the parent-provided editor —
	// but it holds NO Save/Cancel buttons of its own. Edit coordination lives in the
	// parent (which allows only one row open at a time and renders ONE shared
	// Save/Cancel bar). Enter commits, Escape cancels, both delegated to the parent.
	let {
		label,
		canEdit = false,
		editing = false,
		display,
		editor,
		onRequestEdit,
		onCommit,
		onCancel
	}: {
		label: string;
		canEdit?: boolean;
		editing?: boolean;
		display: Snippet;
		editor: Snippet;
		onRequestEdit: () => void;
		onCommit: () => void;
		onCancel: () => void;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			// Let multi-line / combobox editors handle Enter themselves.
			const target = e.target as HTMLElement;
			if (target.tagName === 'TEXTAREA') return;
			e.preventDefault();
			onCommit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	}
</script>

<div class="inline-row" class:inline-row--editing={editing}>
	<span class="inline-row__label">{label}</span>

	{#if !editing}
		<div class="inline-row__value-row">
			<div class="inline-row__value">{@render display()}</div>
			{#if canEdit}
				<button
					type="button"
					class="inline-row__pencil"
					aria-label={`Edit ${label.toLowerCase()}`}
					onclick={onRequestEdit}
				>
					<i class="ri-pencil-line" aria-hidden="true"></i>
				</button>
			{/if}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="inline-row__edit" onkeydown={onKeydown}>
			{@render editor()}
		</div>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.inline-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: $space-2 $space-4;

		& + & {
			border-top: 1px solid var(--color-border);
		}

		&--editing {
			background: var(--color-bg-surface-sunk);
		}

		&__label {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
		}

		&__value-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
			min-height: 1.5rem;
		}

		&__value {
			min-width: 0;
			font-size: $fs-body;
			color: var(--color-text-primary);
			word-break: break-word;
		}

		&__pencil {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			border-radius: $radius-full;
			color: $slate-500;
			border: none;
			background: transparent;
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard;

			i {
				font-size: 2rem;
			}

			&:hover {
				background: var(--color-bg-surface-sunk);
				color: var(--color-brand);
			}
		}

		&__edit {
			display: flex;
			flex-direction: column;
			gap: $space-2;
			padding-top: $space-1;
		}
	}
</style>
