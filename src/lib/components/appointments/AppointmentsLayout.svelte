<script lang="ts">
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import CollapsibleSidebar from '$lib/components/shared/CollapsibleSidebar.svelte';
	import type { Snippet } from 'svelte';

	let {
		sidebar,
		filterSheet,
		filterSheetOpen = $bindable(false),
		children
	}: {
		sidebar: Snippet<[boolean]>;
		filterSheet: Snippet;
		filterSheetOpen?: boolean;
		children: Snippet;
	} = $props();

	let collapsed = $state(true);
</script>

<div class="appt-shell">
	<CollapsibleSidebar bind:collapsed expandLabel="Expand filters" collapseLabel="Collapse filters">
		{@render sidebar(collapsed)}
	</CollapsibleSidebar>

	<!-- Main calendar/list area -->
	<div class="appt-shell__main">
		{@render children()}
	</div>
</div>

<!-- Mobile filter sheet -->
<BottomSheet bind:open={filterSheetOpen} title="Filters">
	<div class="appt-shell__sheet">
		{@render filterSheet()}
	</div>
</BottomSheet>
