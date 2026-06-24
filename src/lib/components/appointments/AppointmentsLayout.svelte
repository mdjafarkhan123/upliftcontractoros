<script lang="ts">
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import type { Snippet } from 'svelte';

	let {
		sidebar,
		filterSheet,
		filterSheetOpen = $bindable(false),
		children
	}: {
		sidebar: Snippet;
		filterSheet: Snippet;
		filterSheetOpen?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="flex flex-1 overflow-hidden">
	<!-- Desktop sidebar -->
	<aside
		class="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-background lg:flex"
	>
		{@render sidebar()}
	</aside>

	<!-- Main calendar/list area -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		{@render children()}
	</div>
</div>

<!-- Mobile filter sheet -->
<BottomSheet bind:open={filterSheetOpen} title="Filters">
	<div class="px-1 pb-4 pt-2">
		{@render filterSheet()}
	</div>
</BottomSheet>
