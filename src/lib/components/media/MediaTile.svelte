<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { Trash2, Loader2, RotateCcw, Image as ImageIcon } from '@lucide/svelte';
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
</script>

<div
	class={cn(
		'group relative aspect-square overflow-hidden rounded-lg bg-muted transition-all duration-150',
		item.status === 'done' && 'cursor-pointer',
		item.status === 'uploading' && 'cursor-wait'
	)}
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
			class="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
			loading="lazy"
		/>
	{:else}
		<div class="flex h-full w-full items-center justify-center">
			<ImageIcon class="h-8 w-8 text-muted-foreground" />
		</div>
	{/if}

	<!-- Upload progress overlay -->
	{#if item.status === 'uploading'}
		<div class="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
			<Loader2 class="h-6 w-6 animate-spin text-white" />
			{#if item.progress !== undefined}
				<div class="mt-2 h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
					<div
						class="h-full rounded-full bg-white transition-all duration-150"
						style:width="{item.progress}%"
					></div>
				</div>
				<span class="mt-1 text-xs font-medium text-white">{Math.round(item.progress)}%</span>
			{/if}
		</div>
	{/if}

	<!-- Error state overlay -->
	{#if item.status === 'error'}
		<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 p-2">
			<span class="text-center text-xs text-white">{item.errorMsg ?? 'Upload failed'}</span>
			<button
				class="flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs font-medium text-white hover:bg-white/30"
				onclick={(e) => {
					e.stopPropagation();
					item.retry?.();
				}}
			>
				<RotateCcw class="h-3 w-3" /> Retry
			</button>
		</div>
	{/if}

	<!-- Mobile long-press delete indicator -->
	{#if showDeleteBtn && canDelete}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50">
			<button
				class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-destructive p-2 text-white shadow-lg"
				onclick={handleDeleteClick}
				aria-label="Delete photo"
			>
				<Trash2 class="h-5 w-5" />
			</button>
		</div>
	{/if}

	<!-- Desktop delete button (hover only) -->
	{#if !isCoarsePointer && canDelete && item.status === 'done'}
		<button
			class="absolute right-1.5 top-1.5 hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 md:flex"
			onclick={handleDeleteClick}
			aria-label="Delete photo"
		>
			<Trash2 class="h-4 w-4" />
		</button>
	{/if}
</div>
