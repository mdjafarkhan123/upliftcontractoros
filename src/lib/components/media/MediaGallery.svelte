<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import MediaTile from './MediaTile.svelte';
	import MediaLightbox from './MediaLightbox.svelte';
	import MediaUploader from './MediaUploader.svelte';
	import MediaCompare from './MediaCompare.svelte';
	import BeforeAfterShareDialog from './BeforeAfterShareDialog.svelte';
	import type { LocalMediaItem } from './types';

	let {
		jobId,
		canUpload = false,
		canDelete = false,
		contactId = '',
		contactName = '',
		canSendMessages = false
	}: {
		jobId: string;
		canUpload?: boolean;
		canDelete?: boolean;
		contactId?: string;
		contactName?: string;
		canSendMessages?: boolean;
	} = $props();

	type FilterTag = 'all' | 'before' | 'after' | 'job_photo';

	let items = $state<LocalMediaItem[]>([]);
	let loading = $state(true);
	let lightboxIndex = $state(-1);
	let filter = $state<FilterTag>('all');
	let deleteTarget = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let shareOpen = $state(false);
	let compareOpen = $state(false);

	// Eligible photos for a branded Before/After share — needs at least one of each.
	const beforeIds = $derived(
		items
			.filter((it) => it.status === 'done' && it.id && it.purpose_tag === 'before')
			.map((it) => it.id!)
	);
	const afterIds = $derived(
		items
			.filter((it) => it.status === 'done' && it.id && it.purpose_tag === 'after')
			.map((it) => it.id!)
	);
	const canShare = $derived(beforeIds.length > 0 && afterIds.length > 0);

	// All persisted photos, regardless of the active filter tab — the source for
	// the on-screen Before/After compare overlay. Compare needs at least one of each.
	const donePhotos = $derived(
		items.filter((it) => it.status === 'done' && it.media_type !== 'pdf')
	);
	const canCompare = $derived(beforeIds.length > 0 && afterIds.length > 0);

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

	// The tab you're standing on becomes the destination for new uploads:
	// Before → 'before', After → 'after', All → 'job_photo' (General).
	const uploadTag = $derived(filter === 'before' || filter === 'after' ? filter : 'job_photo');
	const uploadLabel = $derived(
		filter === 'before'
			? 'Add Before photos'
			: filter === 'after'
				? 'Add After photos'
				: 'Add photos'
	);

	async function retag(localId: string, tag: 'before' | 'after' | 'job_photo') {
		const item = items.find((it) => it.localId === localId);
		if (!item?.id || item.purpose_tag === tag) return;

		const prev = item.purpose_tag;
		// Optimistic
		items = items.map((it) => (it.localId === localId ? { ...it, purpose_tag: tag } : it));
		// If the photo no longer matches the active filter, close the lightbox so the
		// index can't point at a stale slot.
		if (filter !== 'all' && tag !== filter) lightboxIndex = -1;

		try {
			const res = await fetch(`/api/media/${item.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ purpose_tag: tag })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Failed to update tag');
				// Roll back
				items = items.map((it) => (it.localId === localId ? { ...it, purpose_tag: prev } : it));
			}
		} catch {
			toast.error('Failed to update tag');
			items = items.map((it) => (it.localId === localId ? { ...it, purpose_tag: prev } : it));
		}
	}

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

<section class="media-panel">
	<div class="media-panel__header media-panel__header--bordered">
		<div class="media-panel__heading">
			<i class="ri-image-line media-panel__icon" aria-hidden="true"></i>
			<h2 class="media-panel__title">Photos</h2>
			{#if !loading}
				<span class="media-panel__count">({items.filter((i) => i.status !== 'error').length})</span>
			{/if}
		</div>

		{#if canCompare || canUpload}
			<div class="media-panel__actions">
				{#if canCompare}
					<button type="button" class="media-panel__share" onclick={() => (compareOpen = true)}>
						<i class="ri-contrast-drop-line" aria-hidden="true"></i>
						Compare
					</button>
				{/if}
				{#if canUpload}
					{#if canShare}
						<button type="button" class="media-panel__share" onclick={() => (shareOpen = true)}>
							<i class="ri-magic-line" aria-hidden="true"></i>
							Share Before/After
						</button>
					{/if}
					<MediaUploader
						purposeTag={uploadTag}
						label={uploadLabel}
						parentFk={{ job_id: jobId }}
						{onOptimisticAdd}
						{onOptimisticRemove}
						{onUploaded}
					/>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Before/After filter -->
	<div class="media-gallery__filter">
		{#each FILTER_TABS as tab (tab.key)}
			<button
				onclick={() => (filter = tab.key)}
				class="media-gallery__filter-btn"
				class:media-gallery__filter-btn--active={filter === tab.key}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if loading}
		<div class="media-gallery__grid">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="skeleton-shimmer media-gallery__skeleton"></div>
			{/each}
		</div>
	{:else if photoItems.length === 0}
		<EmptyState
			title={filter === 'all' ? 'No photos yet' : `No ${filter} photos`}
			description={canUpload ? 'Tap "Add photos" to upload' : 'No photos have been uploaded.'}
		/>
	{:else}
		<div class="media-gallery__grid">
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
	canRetag={canUpload}
	onRetag={retag}
/>

<MediaCompare items={donePhotos} bind:open={compareOpen} onClose={() => (compareOpen = false)} />

<BeforeAfterShareDialog
	bind:open={shareOpen}
	{beforeIds}
	{afterIds}
	{contactId}
	{contactName}
	canSend={canSendMessages}
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
