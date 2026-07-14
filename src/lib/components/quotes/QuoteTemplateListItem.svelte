<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatCurrency, formatDate } from '$lib/utils/format';
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

<div class="quote-tpl">
	<button type="button" class="quote-tpl__main" onclick={() => onEdit(template.id)}>
		<p class="quote-tpl__name">{template.name}</p>
		{#if template.description}
			<p class="quote-tpl__desc">{template.description}</p>
		{/if}
		<div class="quote-tpl__meta">
			<span class="quote-tpl__meta-item">
				{template.line_item_count} item{template.line_item_count === 1 ? '' : 's'}
			</span>
			<span class="quote-tpl__dot" aria-hidden="true">·</span>
			<span class="quote-tpl__meta-item quote-tpl__meta-item--strong">
				{formatCurrency(template.estimated_subtotal)}
			</span>
			<span class="quote-tpl__dot" aria-hidden="true">·</span>
			<span class="quote-tpl__meta-item">Updated {formatDate(template.updated_at)}</span>
			{#if template.created_by_name}
				<span class="quote-tpl__dot" aria-hidden="true">·</span>
				<span class="quote-tpl__meta-item quote-tpl__meta-item--truncate">
					By {template.created_by_name}
				</span>
			{/if}
		</div>
	</button>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger class="quote-tpl__menu" aria-label="Template actions" disabled={busy}>
			<i class="ri-more-2-fill" aria-hidden="true"></i>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-44">
			<DropdownMenu.Item onSelect={() => onEdit(template.id)}>
				<i class="ri-pencil-line" aria-hidden="true"></i> Edit
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => onDuplicate(template.id)}>
				<i class="ri-file-copy-line" aria-hidden="true"></i> Duplicate
			</DropdownMenu.Item>
			<DropdownMenu.Item variant="destructive" onSelect={() => onDelete(template)}>
				<i class="ri-delete-bin-line" aria-hidden="true"></i> Delete
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
