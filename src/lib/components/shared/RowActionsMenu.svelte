<script lang="ts" module>
	export type RowAction = {
		/** Stable key for the {#each} block. */
		key: string;
		label: string;
		/** Remix icon class, e.g. "ri-pencil-line". */
		icon: string;
		onSelect: () => void;
		/** Renders in the destructive group (red, below a separator). */
		destructive?: boolean;
		disabled?: boolean;
	};
</script>

<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		actions,
		label = 'Row actions',
		align = 'end'
	}: {
		actions: RowAction[];
		/** Accessible name for the trigger, e.g. "Actions for INV-1042". */
		label?: string;
		align?: 'start' | 'center' | 'end';
	} = $props();

	// Destructive actions (Delete/…) always sit at the bottom, separated — the
	// app-wide convention across every list row.
	const normal = $derived(actions.filter((a) => !a.destructive));
	const destructive = $derived(actions.filter((a) => a.destructive));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="row-actions__trigger" aria-label={label}>
		<i class="ri-more-2-fill" aria-hidden="true"></i>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content {align}>
		{#each normal as a (a.key)}
			<DropdownMenu.Item disabled={a.disabled} onclick={a.onSelect}>
				<i class={a.icon} aria-hidden="true"></i>
				{a.label}
			</DropdownMenu.Item>
		{/each}
		{#if destructive.length > 0}
			{#if normal.length > 0}
				<DropdownMenu.Separator />
			{/if}
			{#each destructive as a (a.key)}
				<DropdownMenu.Item variant="destructive" disabled={a.disabled} onclick={a.onSelect}>
					<i class={a.icon} aria-hidden="true"></i>
					{a.label}
				</DropdownMenu.Item>
			{/each}
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// The trigger is rendered by bits-ui's <DropdownMenu.Trigger> (a child
	// component), so scoped selectors can't reach it — style it globally. Kept
	// always-visible on purpose (Jobber pattern): a hover-only kebab is invisible
	// on touch devices.
	:global(.row-actions__trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: $radius-md;
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background-color $duration-fast $ease-standard,
			color $duration-fast $ease-standard;
	}

	:global(.row-actions__trigger i) {
		font-size: 1.5rem;
	}

	:global(.row-actions__trigger:hover) {
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-primary);
	}

	:global(.row-actions__trigger:focus-visible) {
		outline: none;
		box-shadow: var(--shadow-focus);
	}
</style>
