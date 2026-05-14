<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { quoteTemplatesStore } from '$lib/stores/quoteTemplates.svelte';
	import { Loader2, FileText } from '@lucide/svelte';
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
				quantity: li.quantity,
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
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Apply template</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-2">
			{#if quoteTemplatesStore.status === 'loading'}
				<p class="text-sm text-muted-foreground">Loading templates…</p>
			{:else if quoteTemplatesStore.items.length === 0}
				<p class="text-sm text-muted-foreground">No templates yet.</p>
			{:else}
				<ul class="grid gap-2">
					{#each quoteTemplatesStore.items as tpl (tpl.id)}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
								onclick={() => apply(tpl.id)}
								disabled={busyId !== null}
							>
								<div class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
									{#if busyId === tpl.id}
										<Loader2 class="h-4 w-4 animate-spin" />
									{:else}
										<FileText class="h-4 w-4" />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{tpl.name}</p>
									<p class="text-xs text-muted-foreground">
										{tpl.line_item_count} item{tpl.line_item_count === 1 ? '' : 's'}
									</p>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
