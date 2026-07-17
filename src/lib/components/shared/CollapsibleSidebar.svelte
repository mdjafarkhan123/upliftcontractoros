<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		collapsed = $bindable(false),
		expandIcon = 'ri-side-bar-line',
		collapseIcon = 'ri-side-bar-line',
		expandLabel = 'Expand sidebar',
		collapseLabel = 'Collapse sidebar',
		header,
		children
	}: {
		collapsed?: boolean;
		expandIcon?: string;
		collapseIcon?: string;
		expandLabel?: string;
		collapseLabel?: string;
		header?: Snippet;
		children: Snippet<[boolean]>;
	} = $props();
</script>

<aside class="c-sidebar" class:c-sidebar--collapsed={collapsed}>
	{#if header}
		<div class="c-sidebar__header">
			{@render header()}
		</div>
	{/if}

	<div class="c-sidebar__body">
		<button
			type="button"
			class="c-sidebar__toggle"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? expandLabel : collapseLabel}
			title={collapsed ? expandLabel : collapseLabel}
		>
			<i class={collapsed ? expandIcon : collapseIcon} aria-hidden="true"></i>
		</button>
		<div class="c-sidebar__content">
			{@render children(collapsed)}
		</div>
	</div>
</aside>
