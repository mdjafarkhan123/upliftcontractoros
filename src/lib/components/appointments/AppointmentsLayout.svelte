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

<div class="appt-shell">
	<!-- Desktop sidebar -->
	<aside class="appt-shell__sidebar">
		{@render sidebar()}
	</aside>

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
