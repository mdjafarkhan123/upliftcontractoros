<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { MoreVertical, Pencil, Copy, Trash2 } from '@lucide/svelte';
	import type { QuoteTemplateListItem } from '$lib/types/quotes';

	let {
		template,
		onEdit,
		onDuplicate,
		onDelete,
		busy = false
	}: {
		template: QuoteTemplateListItem;
		onEdit: (id: string) => void;
		onDuplicate: (id: string) => void;
		onDelete: (template: QuoteTemplateListItem) => void;
		busy?: boolean;
	} = $props();
</script>

<div class="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30">
	<div class="flex items-start gap-3">
		<button
			type="button"
			class="min-w-0 flex-1 text-left"
			onclick={() => onEdit(template.id)}
		>
			<p class="truncate text-sm font-semibold">{template.name}</p>
			{#if template.description}
				<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
					{template.description}
				</p>
			{/if}
			<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span class="tabular-nums">
					{template.line_item_count} item{template.line_item_count === 1 ? '' : 's'}
				</span>
				<span aria-hidden="true">·</span>
				<span class="font-medium tabular-nums text-foreground">
					{formatCurrency(template.estimated_subtotal)}
				</span>
				<span aria-hidden="true">·</span>
				<span>Updated {formatDate(template.updated_at)}</span>
				{#if template.created_by_name}
					<span aria-hidden="true">·</span>
					<span class="truncate">By {template.created_by_name}</span>
				{/if}
			</div>
		</button>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50"
				aria-label="Template actions"
				disabled={busy}
			>
				<MoreVertical class="h-4 w-4" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-44">
				<DropdownMenu.Item onSelect={() => onEdit(template.id)}>
					<Pencil class="mr-2 h-4 w-4" /> Edit
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => onDuplicate(template.id)}>
					<Copy class="mr-2 h-4 w-4" /> Duplicate
				</DropdownMenu.Item>
				<DropdownMenu.Item variant="destructive" onSelect={() => onDelete(template)}>
					<Trash2 class="mr-2 h-4 w-4" /> Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
