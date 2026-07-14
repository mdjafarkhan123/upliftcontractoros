<script lang="ts">
	import type { Snippet } from 'svelte';

	// The ONE list-page table shell for every entity (Contacts, Quotes, Jobs,
	// Invoices…). It owns all chrome — the frame, header row, row borders, hover,
	// spacing, and responsive column-hiding — via the global `.list-table`
	// stylesheet. Each entity hands in its own columns as `head` (the <th> cells)
	// and `body` (the <tr> rows) snippets, using the shared `list-table__*`
	// classes for chrome and its own content classes for cell internals.
	let {
		head,
		body,
		/** Table min-width before the horizontal scroll kicks in. */
		minWidth = '640px',
		ariaLabel
	}: {
		head: Snippet;
		body: Snippet;
		minWidth?: string;
		ariaLabel?: string;
	} = $props();
</script>

<div class="list-table">
	<div class="list-table__scroll">
		<table class="list-table__table" style:--list-table-min={minWidth} aria-label={ariaLabel}>
			<thead>
				<tr class="list-table__head-row">
					{@render head()}
				</tr>
			</thead>
			<tbody>
				{@render body()}
			</tbody>
		</table>
	</div>
</div>
