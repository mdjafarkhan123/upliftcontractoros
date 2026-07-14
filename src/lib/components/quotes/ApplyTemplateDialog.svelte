<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { quoteTemplatesStore } from '$lib/stores/quoteTemplates.svelte';
	import type { QuoteLineDraft, QuoteTemplateDetail } from '$lib/types/quotes';

	let {
		open = $bindable(false),
		onApply
	}: {
		open?: boolean;
		onApply: (items: QuoteLineDraft[]) => void;
	} = $props();

	let busyId = $state<string | null>(null);

	$effect(() => {
		if (open) void quoteTemplatesStore.load();
	});

	async function apply(templateId: string) {
		busyId = templateId;
		try {
			const res = await fetch(`/api/quote-templates/${templateId}`);
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to load template');
				return;
			}
			const tpl = body.data as QuoteTemplateDetail;
			const drafts: QuoteLineDraft[] = tpl.line_items.map((li) => ({
				client_id: crypto.randomUUID(),
				description: li.description,
				details: li.details ?? null,
				quantity: li.quantity,
				unit: li.unit ?? '',
				section_label: li.section_label ?? null,
				is_optional: li.is_optional ?? false,
				taxable: li.taxable ?? true,
				unit_price: li.unit_price
			}));
			onApply(drafts);
			toast.success(`Added ${drafts.length} line item${drafts.length === 1 ? '' : 's'}`);
			open = false;
		} catch {
			toast.error('Network error');
		} finally {
			busyId = null;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="apply-tpl">
		<div class="dialog-content__header">
			<h2 class="dialog-content__title">Apply template</h2>
		</div>
		<div class="apply-tpl__body">
			{#if quoteTemplatesStore.status === 'loading'}
				<p class="apply-tpl__empty">Loading templates…</p>
			{:else if quoteTemplatesStore.items.length === 0}
				<p class="apply-tpl__empty">No templates yet.</p>
			{:else}
				<ul class="apply-tpl__list">
					{#each quoteTemplatesStore.items as tpl (tpl.id)}
						<li>
							<button
								type="button"
								class="apply-tpl__item"
								onclick={() => apply(tpl.id)}
								disabled={busyId !== null}
							>
								<span class="apply-tpl__icon" class:apply-tpl__icon--busy={busyId === tpl.id}>
									{#if busyId === tpl.id}
										<i class="ri-loader-4-line" aria-hidden="true"></i>
									{:else}
										<i class="ri-file-list-3-line" aria-hidden="true"></i>
									{/if}
								</span>
								<span class="apply-tpl__info">
									<span class="apply-tpl__name">{tpl.name}</span>
									<span class="apply-tpl__count">
										{tpl.line_item_count} item{tpl.line_item_count === 1 ? '' : 's'}
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div class="dialog-content__footer">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
