<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import QuoteTemplateListItem from '$lib/components/quotes/QuoteTemplateListItem.svelte';
	import TemplateEditorSheet from '$lib/components/quotes/TemplateEditorSheet.svelte';
	import { quoteTemplatesStore } from '$lib/stores/quoteTemplates.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { goto } from '$app/navigation';
	import { FileText, Plus } from '@lucide/svelte';
	import type { QuoteTemplateListItem as TemplateItem } from '$lib/types/quotes';

	const memberAccessor = getMemberContext();
	const member = $derived(memberAccessor());
	const canView = $derived(member.can_create_quotes || member.can_edit_quotes);
	const canManage = $derived(member.can_edit_quotes);

	$effect(() => {
		if (!canView) {
			goto('/quotes');
			return;
		}
		void quoteTemplatesStore.load();
	});

	let editorOpen = $state(false);
	let editingId = $state<string | null>(null);
	let confirmOpen = $state(false);
	let toDelete = $state<TemplateItem | null>(null);
	let deleting = $state(false);
	let duplicatingId = $state<string | null>(null);

	const items = $derived(quoteTemplatesStore.items);
	const status = $derived(quoteTemplatesStore.status);
	const errorMsg = $derived(quoteTemplatesStore.error);
	const showSkeleton = $derived(status === 'loading' && items.length === 0);
	const showError = $derived(status === 'error' && items.length === 0);

	function openCreate() {
		editingId = null;
		editorOpen = true;
	}

	function openEdit(id: string) {
		editingId = id;
		editorOpen = true;
	}

	async function duplicate(id: string) {
		duplicatingId = id;
		try {
			const res = await fetch(`/api/quote-templates/${id}/duplicate`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to duplicate template');
				return;
			}
			await quoteTemplatesStore.refetch();
			toast.success('Template duplicated');
		} catch {
			toast.error('Network error');
		} finally {
			duplicatingId = null;
		}
	}

	function askDelete(template: TemplateItem) {
		toDelete = template;
		confirmOpen = true;
	}

	async function confirmDelete() {
		if (!toDelete) return;
		const id = toDelete.id;
		deleting = true;
		try {
			const res = await fetch(`/api/quote-templates/${id}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 204) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to delete template');
				return;
			}
			quoteTemplatesStore.removeLocal(id);
			toast.success('Template deleted');
			toDelete = null;
		} catch {
			toast.error('Network error');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>Quote templates</title></svelte:head>

<PageWrapper
	title="Quote templates"
	subtitle="Reusable line items for faster quoting"
	back="/quotes"
>
	{#snippet actions()}
		<Button variant="outline" onclick={() => goto('/quotes')}>Back to quotes</Button>
		{#if canManage}
			<Button onclick={openCreate}>
				<Plus class="mr-1 h-4 w-4" />New template
			</Button>
		{/if}
	{/snippet}

	<div class="space-y-3">
		{#if showSkeleton}
			<SkeletonLoader lines={5} height="92px" label="Loading templates" />
		{:else if showError}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{:else if items.length === 0}
			<EmptyState
				icon={FileText}
				title="No quote templates yet"
				description="Create reusable templates to speed up quote creation."
				actionLabel={canManage ? 'Create template' : undefined}
				onAction={canManage ? openCreate : undefined}
			/>
		{:else}
			<ul class="grid gap-3">
				{#each items as template (template.id)}
					<li>
						<QuoteTemplateListItem
							{template}
							onEdit={openEdit}
							onDuplicate={duplicate}
							onDelete={askDelete}
							busy={duplicatingId === template.id}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<TemplateEditorSheet bind:open={editorOpen} templateId={editingId} />

	<ConfirmDialog
		bind:open={confirmOpen}
		title="Delete this template?"
		description="Existing quotes using this template will not be affected."
		confirmLabel="Delete"
		variant="destructive"
		loading={deleting}
		onConfirm={confirmDelete}
	/>
</PageWrapper>
