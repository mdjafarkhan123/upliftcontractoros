<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import MediaTile from './MediaTile.svelte';
	import MediaLightbox from './MediaLightbox.svelte';
	import MediaUploader from './MediaUploader.svelte';
	import type { LocalMediaItem } from './types';
	import { ImageIcon } from '@lucide/svelte';

	let {
		jobId,
		canUpload = false,
		canDelete = false
	}: {
		jobId: string;
		canUpload?: boolean;
		canDelete?: boolean;
	} = $props();

	type FilterTag = 'all' | 'before' | 'after' | 'job_photo';

	let items = $state<LocalMediaItem[]>([]);
	let loading = $state(true);
	let lightboxIndex = $state(-1);
	let filter = $state<FilterTag>('all');
	let deleteTarget = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	const photoItems = $derived(
		items.filter(
			(it) =>
				it.status !== 'error' &&
				it.media_type !== 'pdf' &&
				(filter === 'all' ||
					it.purpose_tag === filter ||
					(filter === 'job_photo' && (it.status === 'uploading' || !it.purpose_tag)))
		)
	);

	const lightboxItems = $derived(photoItems.filter((it) => it.status === 'done'));

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/media/list?job_id=${jobId}`);
			if (!res.ok) return;
			const body = (await res.json()) as {
				data: {
					id: string;
					r2_key: string;
					thumbnail_key: string | null;
					web_key: string | null;
					original_filename: string;
					file_size_bytes: number;
					media_type: 'photo' | 'pdf' | 'attachment';
					mime_type: string;
					purpose_tag: string;
					created_at: string;
				}[];
			};
			items = body.data.map((r) => ({
				localId: r.id,
				status: 'done' as const,
				...r
			}));
		} finally {
			loading = false;
		}
	}

	// Lazily fetch presigned thumbnail URL for a single tile
	async function fetchThumbnailUrl(item: LocalMediaItem) {
		if (!item.id || item.thumbnailUrl || item.status !== 'done') return;
		if (!item.thumbnail_key && !item.r2_key) return;
		try {
			const res = await fetch(`/api/media/${item.id}/url?variant=thumbnail`);
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { url: string } };
			const url = body.data?.url;
			if (!url) return;
			items = items.map((it) => (it.localId === item.localId ? { ...it, thumbnailUrl: url } : it));
		} catch {
			// silent — tile will show placeholder
		}
	}

	function onOptimisticAdd(item: LocalMediaItem) {
		const idx = items.findIndex((it) => it.localId === item.localId);
		if (idx >= 0) {
			items = items.map((it, i) => (i === idx ? item : it));
		} else {
			items = [item, ...items];
		}
	}

	function onOptimisticRemove(localId: string) {
		items = items.filter((it) => it.localId !== localId);
	}

	function onUploaded(item: LocalMediaItem) {
		items = [item, ...items.filter((it) => it.localId !== item.localId)];
	}

	function openLightbox(item: LocalMediaItem) {
		const idx = lightboxItems.findIndex((it) => it.localId === item.localId);
		if (idx >= 0) lightboxIndex = idx;
	}

	function confirmDelete(localId: string) {
		deleteTarget = localId;
		deleteOpen = true;
	}

	async function doDelete() {
		if (!deleteTarget) return;
		const item = items.find((it) => it.localId === deleteTarget);
		if (!item?.id) {
			deleteTarget = null;
			deleteOpen = false;
			return;
		}
		deleting = true;
		try {
			const res = await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Failed to delete');
				return;
			}
			items = items.filter((it) => it.localId !== deleteTarget);
			toast.success('Photo deleted');
		} finally {
			deleting = false;
			deleteTarget = null;
			deleteOpen = false;
		}
	}

	onMount(() => {
		void load();
	});

	const FILTER_TABS: { key: FilterTag; label: string }[] = [
		{ key: 'all', label: 'All' },
		{ key: 'before', label: 'Before' },
		{ key: 'after', label: 'After' }
	];
</script>

<section class="rounded-lg border border-border/60 bg-card p-4 shadow-card">
	<div class="mb-3 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
		<div class="flex items-center gap-1.5">
			<ImageIcon class="h-4 w-4 text-muted-foreground" />
			<h2 class="text-sm font-semibold text-foreground">Photos</h2>
			{#if !loading}
				<span class="text-xs text-muted-foreground"
					>({items.filter((i) => i.status !== 'error').length})</span
				>
			{/if}
		</div>

		{#if canUpload}
			<MediaUploader
				purposeTag="job_photo"
				parentFk={{ job_id: jobId }}
				{onOptimisticAdd}
				{onOptimisticRemove}
				{onUploaded}
			/>
		{/if}
	</div>

	<!-- Before/After filter -->
	<div class="mb-3 inline-flex rounded-md border border-border/60 bg-muted/30 p-0.5">
		{#each FILTER_TABS as tab (tab.key)}
			<button
				onclick={() => (filter = tab.key)}
				class={[
					'min-h-8 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					filter === tab.key
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'
				].join(' ')}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if loading}
		<div class="grid grid-cols-2 gap-2">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="skeleton-shimmer aspect-square rounded-lg bg-muted"></div>
			{/each}
		</div>
	{:else if photoItems.length === 0}
		<EmptyState
			title={filter === 'all' ? 'No photos yet' : `No ${filter} photos`}
			description={canUpload ? 'Tap "Add photos" to upload' : 'No photos have been uploaded.'}
		/>
	{:else}
		<div class="grid grid-cols-2 gap-2">
			{#each photoItems as item (item.localId)}
				{@const tileItem = (() => {
					if (item.status === 'done' && !item.thumbnailUrl) {
						void fetchThumbnailUrl(item);
					}
					return item;
				})()}
				<MediaTile
					item={tileItem}
					{canDelete}
					onTap={() => openLightbox(item)}
					onDelete={() => confirmDelete(item.localId)}
				/>
			{/each}
		</div>
	{/if}
</section>

<MediaLightbox
	items={lightboxItems}
	bind:activeIndex={lightboxIndex}
	onClose={() => (lightboxIndex = -1)}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete photo?"
	description="This photo will be permanently removed."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={doDelete}
/>
