<script lang="ts">
	import type { LocalMediaItem } from './types';

	let {
		item,
		onTap,
		onDelete,
		canDelete = false
	}: {
		item: LocalMediaItem;
		onTap: () => void;
		onDelete: () => void;
		canDelete?: boolean;
	} = $props();

	// Detect coarse pointer (mobile) for long-press delete vs desktop delete button
	const isCoarsePointer =
		typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let didLongPress = $state(false);
	let showDeleteBtn = $state(false);

	function startLongPress() {
		if (!canDelete || !isCoarsePointer) return;
		longPressTimer = setTimeout(() => {
			didLongPress = true;
			showDeleteBtn = true;
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (item.status === 'uploading' || item.status === 'error') return;
		didLongPress = false;
		startLongPress();
	}

	function handlePointerUp(e: PointerEvent) {
		cancelLongPress();
		if (!didLongPress) {
			// Short tap → open lightbox
			if (item.status === 'done') onTap();
		}
		didLongPress = false;
	}

	function handleClick(e: MouseEvent) {
		// Desktop: allow click through to lightbox if not a delete click
		if (isCoarsePointer) return; // mobile handled via pointer events
		if (item.status === 'done') onTap();
	}

	function handleDeleteClick(e: MouseEvent) {
		e.stopPropagation();
		showDeleteBtn = false;
		onDelete();
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Before/After corner chip so photos are identifiable at a glance on the "All" tab.
	const tagLabel = $derived(
		item.purpose_tag === 'before' ? 'Before' : item.purpose_tag === 'after' ? 'After' : null
	);
</script>

<div
	class="media-tile"
	class:media-tile--clickable={item.status === 'done'}
	class:media-tile--uploading={item.status === 'uploading'}
	role="button"
	tabindex={item.status === 'done' ? 0 : -1}
	aria-label={item.original_filename ?? 'Photo'}
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	onpointercancel={cancelLongPress}
	onpointerleave={cancelLongPress}
	onclick={handleClick}
	onkeydown={(e) => e.key === 'Enter' && item.status === 'done' && onTap()}
>
	<!-- Thumbnail or optimistic preview -->
	{#if item.previewUrl || item.thumbnailUrl}
		<img
			src={item.thumbnailUrl ?? item.previewUrl}
			alt={item.original_filename ?? 'Photo'}
			class="media-tile__img"
			loading="lazy"
		/>
	{:else}
		<div class="media-tile__placeholder">
			<i class="ri-image-line" aria-hidden="true"></i>
		</div>
	{/if}

	<!-- Before/After tag chip -->
	{#if tagLabel && item.status === 'done'}
		<span
			class="media-tile__badge"
			class:media-tile__badge--before={item.purpose_tag === 'before'}
			class:media-tile__badge--after={item.purpose_tag === 'after'}
		>
			{tagLabel}
		</span>
	{/if}

	<!-- Upload progress overlay -->
	{#if item.status === 'uploading'}
		<div class="media-tile__overlay media-tile__overlay--uploading">
			<i class="ri-loader-4-line animate-spin media-tile__spinner" aria-hidden="true"></i>
			{#if item.progress !== undefined}
				<div class="media-tile__progress">
					<div class="media-tile__progress-bar" style:width="{item.progress}%"></div>
				</div>
				<span class="media-tile__pct">{Math.round(item.progress)}%</span>
			{/if}
		</div>
	{/if}

	<!-- Error state overlay -->
	{#if item.status === 'error'}
		<div class="media-tile__overlay media-tile__overlay--error">
			<span class="media-tile__error-msg">{item.errorMsg ?? 'Upload failed'}</span>
			<button
				class="media-tile__retry"
				onclick={(e) => {
					e.stopPropagation();
					item.retry?.();
				}}
			>
				<i class="ri-restart-line" aria-hidden="true"></i> Retry
			</button>
		</div>
	{/if}

	<!-- Mobile long-press delete indicator -->
	{#if showDeleteBtn && canDelete}
		<div class="media-tile__overlay media-tile__overlay--delete">
			<button class="media-tile__delete-mobile" onclick={handleDeleteClick} aria-label="Delete photo">
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
			</button>
		</div>
	{/if}

	<!-- Desktop delete button (hover only) -->
	{#if !isCoarsePointer && canDelete && item.status === 'done'}
		<button class="media-tile__delete-desktop" onclick={handleDeleteClick} aria-label="Delete photo">
			<i class="ri-delete-bin-line" aria-hidden="true"></i>
		</button>
	{/if}
</div>
