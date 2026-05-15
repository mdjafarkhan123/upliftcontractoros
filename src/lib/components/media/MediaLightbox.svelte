<script lang="ts">
	import { X, ChevronLeft, ChevronRight, Loader2 } from '@lucide/svelte';
	import type { LocalMediaItem } from './types';

	let {
		items,
		activeIndex = $bindable(-1),
		onClose
	}: {
		items: LocalMediaItem[];
		activeIndex?: number;
		onClose: () => void;
	} = $props();

	const open = $derived(activeIndex >= 0 && activeIndex < items.length);
	const activeItem = $derived(open ? items[activeIndex] : null);

	let webUrl = $state<string | null>(null);
	let webLoading = $state(false);
	let lastFetchedId = $state<string | null>(null);

	// Lazy-load the web-size image when active item changes
	$effect(() => {
		if (!activeItem?.id) return;
		if (lastFetchedId === activeItem.id) return;
		if (!activeItem.web_key && !activeItem.r2_key) return;

		lastFetchedId = activeItem.id;
		webUrl = null;
		webLoading = true;

		fetch(`/api/media/${activeItem.id}/url?variant=web`)
			.then((r) => r.json())
			.then((body: { data?: { url: string } }) => {
				webUrl = body.data?.url ?? null;
			})
			.catch(() => {
				webUrl = null;
			})
			.finally(() => {
				webLoading = false;
			});
	});

	function prev() {
		if (activeIndex > 0) activeIndex--;
	}
	function next() {
		if (activeIndex < items.length - 1) activeIndex++;
	}

	// Swipe support
	let touchStartX = 0;
	let touchStartY = 0;

	function onTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0]?.clientX ?? 0;
		touchStartY = e.touches[0]?.clientY ?? 0;
	}

	function onTouchEnd(e: TouchEvent) {
		const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
		const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStartY;
		// Only act on predominantly horizontal swipes
		if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
		if (dx < 0) next();
		else prev();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
		else if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
		role="dialog"
		aria-modal="true"
		aria-label="Photo viewer"
		tabindex="-1"
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		<!-- Close button -->
		<button
			class="absolute right-4 top-4 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
			onclick={onClose}
			aria-label="Close"
		>
			<X class="h-5 w-5" />
		</button>

		<!-- Prev button -->
		{#if activeIndex > 0}
			<button
				class="absolute left-4 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
				onclick={prev}
				aria-label="Previous photo"
			>
				<ChevronLeft class="h-6 w-6" />
			</button>
		{/if}

		<!-- Image area -->
		<div class="flex h-full w-full items-center justify-center p-4">
			{#if webLoading}
				<div class="flex flex-col items-center gap-3">
					<!-- Show thumbnail while full image loads -->
					{#if activeItem?.thumbnailUrl ?? activeItem?.previewUrl}
						<img
							src={activeItem.thumbnailUrl ?? activeItem.previewUrl}
							alt={activeItem?.original_filename ?? 'Photo'}
							class="max-h-[70vh] max-w-full rounded-lg object-contain opacity-60 blur-sm"
						/>
					{:else}
						<Loader2 class="h-8 w-8 animate-spin text-white/60" />
					{/if}
					<span class="text-xs text-white/40">Loading full image…</span>
				</div>
			{:else if webUrl}
				<img
					src={webUrl}
					alt={activeItem?.original_filename ?? 'Photo'}
					class="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
				/>
			{:else if activeItem?.previewUrl ?? activeItem?.thumbnailUrl}
				<img
					src={activeItem.previewUrl ?? activeItem.thumbnailUrl}
					alt={activeItem?.original_filename ?? 'Photo'}
					class="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
				/>
			{/if}
		</div>

		<!-- Next button -->
		{#if activeIndex < items.length - 1}
			<button
				class="absolute right-4 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
				onclick={next}
				aria-label="Next photo"
			>
				<ChevronRight class="h-6 w-6" />
			</button>
		{/if}

		<!-- Counter -->
		{#if items.length > 1}
			<div class="absolute bottom-6 left-1/2 -translate-x-1/2">
				<span class="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
					{activeIndex + 1} / {items.length}
				</span>
			</div>
		{/if}
	</div>
{/if}
