<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Clock } from '@lucide/svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type TimelineItem = {
		id: string;
		source_table: 'contact_notes';
		type: 'note';
		created_at: string;
		data: { content: string; author_id: string | null; author_name: string | null };
	};

	let { contactId }: { contactId: string } = $props();

	let items = $state<TimelineItem[]>([]);
	let nextCursor = $state<string | null>(null);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errorMsg = $state<string | null>(null);

	async function load(cursor: string | null) {
		const params = new SvelteURLSearchParams();
		if (cursor) params.set('cursor', cursor);
		const res = await fetch(`/api/contacts/${contactId}/timeline?${params.toString()}`);
		if (!res.ok) {
			errorMsg = 'Failed to load timeline.';
			return;
		}
		const body = (await res.json()) as { items: TimelineItem[]; next_cursor: string | null };
		if (cursor) items = [...items, ...body.items];
		else items = body.items;
		nextCursor = body.next_cursor;
	}

	$effect(() => {
		loading = true;
		errorMsg = null;
		load(null).finally(() => (loading = false));
	});

	async function loadMore() {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		await load(nextCursor);
		loadingMore = false;
	}

	function formatWhen(iso: string) {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}
</script>

{#if loading}
	<SkeletonLoader lines={4} label="Loading timeline" />
{:else if errorMsg}
	<p class="text-sm text-destructive">{errorMsg}</p>
{:else if items.length === 0}
	<EmptyState
		title="No timeline activity yet"
		description="Notes, messages, and other events will appear here as they happen."
		icon={Clock}
	/>
{:else}
	<ol class="space-y-3">
		{#each items as item (item.id)}
			<li class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
					<span class="font-medium uppercase tracking-wide">Note</span>
					<time>{formatWhen(item.created_at)}</time>
				</div>
				<p class="mt-2 whitespace-pre-wrap text-sm text-foreground">{item.data.content}</p>
				{#if item.data.author_name}
					<p class="mt-2 text-xs text-muted-foreground">— {item.data.author_name}</p>
				{/if}
			</li>
		{/each}
	</ol>
	{#if nextCursor}
		<div class="mt-4 flex justify-center">
			<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
				{loadingMore ? 'Loading…' : 'Load more'}
			</Button>
		</div>
	{/if}
{/if}
