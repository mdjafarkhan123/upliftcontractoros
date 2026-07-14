<script lang="ts">
	import type { LocalMediaItem } from './types';

	let {
		items,
		activeIndex = $bindable(-1),
		onClose,
		canRetag = false,
		onRetag
	}: {
		items: LocalMediaItem[];
		activeIndex?: number;
		onClose: () => void;
		canRetag?: boolean;
		onRetag?: (localId: string, tag: 'before' | 'after' | 'job_photo') => void;
	} = $props();

	const RETAG_OPTIONS: { key: 'before' | 'after' | 'job_photo'; label: string }[] = [
		{ key: 'before', label: 'Before' },
		{ key: 'after', label: 'After' },
		{ key: 'job_photo', label: 'General' }
	];

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
		class="media-lightbox"
		role="dialog"
		aria-modal="true"
		aria-label="Photo viewer"
		tabindex="-1"
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		<!-- Close button -->
		<button class="media-lightbox__btn media-lightbox__btn--close" onclick={onClose} aria-label="Close">
			<i class="ri-close-line" aria-hidden="true"></i>
		</button>

		<!-- Prev button -->
		{#if activeIndex > 0}
			<button
				class="media-lightbox__btn media-lightbox__btn--prev"
				onclick={prev}
				aria-label="Previous photo"
			>
				<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
			</button>
		{/if}

		<!-- Image area -->
		<div class="media-lightbox__stage">
			{#if webLoading}
				<div class="media-lightbox__loading">
					<!-- Show thumbnail while full image loads -->
					{#if activeItem?.thumbnailUrl ?? activeItem?.previewUrl}
						<img
							src={activeItem.thumbnailUrl ?? activeItem.previewUrl}
							alt={activeItem?.original_filename ?? 'Photo'}
							class="media-lightbox__img media-lightbox__img--preview"
						/>
					{:else}
						<i class="ri-loader-4-line animate-spin media-lightbox__spinner" aria-hidden="true"></i>
					{/if}
					<span class="media-lightbox__loading-text">Loading full image…</span>
				</div>
			{:else if webUrl}
				<img
					src={webUrl}
					alt={activeItem?.original_filename ?? 'Photo'}
					class="media-lightbox__img"
				/>
			{:else if activeItem?.previewUrl ?? activeItem?.thumbnailUrl}
				<img
					src={activeItem.previewUrl ?? activeItem.thumbnailUrl}
					alt={activeItem?.original_filename ?? 'Photo'}
					class="media-lightbox__img"
				/>
			{/if}
		</div>

		<!-- Next button -->
		{#if activeIndex < items.length - 1}
			<button
				class="media-lightbox__btn media-lightbox__btn--next"
				onclick={next}
				aria-label="Next photo"
			>
				<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
			</button>
		{/if}

		<!-- Re-tag control -->
		{#if canRetag && onRetag && activeItem?.id}
			<div class="media-lightbox__retag">
				{#each RETAG_OPTIONS as opt (opt.key)}
					<button
						class="media-lightbox__retag-btn"
						class:media-lightbox__retag-btn--active={(activeItem.purpose_tag ?? 'job_photo') ===
							opt.key}
						onclick={() => onRetag(activeItem.localId, opt.key)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Counter -->
		{#if items.length > 1}
			<div class="media-lightbox__counter">
				{activeIndex + 1} / {items.length}
			</div>
		{/if}
	</div>
{/if}
