<script lang="ts">
	import type { LocalMediaItem } from './types';

	let {
		items,
		open = $bindable(false),
		onClose
	}: {
		/** All persisted (done) job photos — Before/After are derived from purpose_tag. */
		items: LocalMediaItem[];
		open?: boolean;
		onClose: () => void;
	} = $props();

	type Mode = 'slider' | 'side';

	const beforeItems = $derived(items.filter((it) => it.purpose_tag === 'before' && it.id));
	const afterItems = $derived(items.filter((it) => it.purpose_tag === 'after' && it.id));

	let mode = $state<Mode>('slider');
	let beforeId = $state<string | null>(null);
	let afterId = $state<string | null>(null);
	let sliderPct = $state(50);

	// Presigned image URLs, cached by media id. `webUrls` for the big stage,
	// `thumbs` for the small picker strips.
	let webUrls = $state<Record<string, string>>({});
	let thumbs = $state<Record<string, string>>({});

	const beforeUrl = $derived(beforeId ? (webUrls[beforeId] ?? null) : null);
	const afterUrl = $derived(afterId ? (webUrls[afterId] ?? null) : null);
	const ready = $derived(Boolean(beforeUrl && afterUrl));

	async function fetchUrl(id: string, variant: 'web' | 'thumbnail', cache: 'webUrls' | 'thumbs') {
		if (cache === 'webUrls' ? webUrls[id] : thumbs[id]) return;
		try {
			const res = await fetch(`/api/media/${id}/url?variant=${variant}`);
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { url: string } };
			const url = body.data?.url;
			if (!url) return;
			if (cache === 'webUrls') webUrls = { ...webUrls, [id]: url };
			else thumbs = { ...thumbs, [id]: url };
		} catch {
			// silent — stage/picker shows placeholder
		}
	}

	// Seed selections + reset view each time the overlay opens.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			mode = 'slider';
			sliderPct = 50;
			beforeId = beforeItems[0]?.id ?? null;
			afterId = afterItems[0]?.id ?? null;
		}
		wasOpen = open;
	});

	// Load the big images for the active pair + thumbnails for the pickers.
	$effect(() => {
		if (!open) return;
		if (beforeId) void fetchUrl(beforeId, 'web', 'webUrls');
		if (afterId) void fetchUrl(afterId, 'web', 'webUrls');
		for (const it of [...beforeItems, ...afterItems]) {
			if (it.id) void fetchUrl(it.id, 'thumbnail', 'thumbs');
		}
	});

	// --- Slider drag (pointer events cover mouse + touch) ---
	let stageEl = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	function setPctFromClientX(clientX: number) {
		if (!stageEl) return;
		const rect = stageEl.getBoundingClientRect();
		if (rect.width === 0) return;
		const pct = ((clientX - rect.left) / rect.width) * 100;
		sliderPct = Math.max(0, Math.min(100, pct));
	}

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		setPctFromClientX(e.clientX);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		setPctFromClientX(e.clientX);
	}
	function onPointerUp() {
		dragging = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			onClose();
		} else if (mode === 'slider' && e.key === 'ArrowLeft') {
			sliderPct = Math.max(0, sliderPct - 5);
		} else if (mode === 'slider' && e.key === 'ArrowRight') {
			sliderPct = Math.min(100, sliderPct + 5);
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} onpointermove={onPointerMove} onpointerup={onPointerUp} />

{#if open}
	<div class="media-compare" role="dialog" aria-modal="true" aria-label="Compare before and after">
		<!-- Top bar: mode toggle + close -->
		<div class="media-compare__bar">
			<div class="media-compare__modes">
				<button
					type="button"
					class="media-compare__mode-btn"
					class:media-compare__mode-btn--active={mode === 'slider'}
					onclick={() => (mode = 'slider')}
				>
					<i class="ri-contrast-drop-line" aria-hidden="true"></i> Slider
				</button>
				<button
					type="button"
					class="media-compare__mode-btn"
					class:media-compare__mode-btn--active={mode === 'side'}
					onclick={() => (mode = 'side')}
				>
					<i class="ri-layout-column-line" aria-hidden="true"></i> Side by side
				</button>
			</div>
			<button
				type="button"
				class="media-compare__close"
				onclick={onClose}
				aria-label="Close compare"
			>
				<i class="ri-close-line" aria-hidden="true"></i>
			</button>
		</div>

		<!-- Stage -->
		<div class="media-compare__stage-wrap">
			{#if !ready}
				<div class="media-compare__loading">
					<i class="ri-loader-4-line media-compare__spin" aria-hidden="true"></i>
					<span>Loading photos…</span>
				</div>
			{:else if mode === 'slider'}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="media-compare__slider"
					bind:this={stageEl}
					onpointerdown={onPointerDown}
					class:media-compare__slider--dragging={dragging}
				>
					<!-- Before sits underneath (full) -->
					<img src={beforeUrl} alt="Before" class="media-compare__layer" draggable="false" />
					<!-- After on top, clipped to the left of the handle -->
					<img
						src={afterUrl}
						alt="After"
						class="media-compare__layer media-compare__layer--after"
						style="clip-path: inset(0 {100 - sliderPct}% 0 0)"
						draggable="false"
					/>

					<span class="media-compare__tag media-compare__tag--after">After</span>
					<span class="media-compare__tag media-compare__tag--before">Before</span>

					<!-- Drag handle -->
					<div class="media-compare__handle" style="left: {sliderPct}%">
						<span class="media-compare__handle-grip">
							<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
							<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
						</span>
					</div>
				</div>
			{:else}
				<div class="media-compare__side">
					<div class="media-compare__side-pane">
						<img src={beforeUrl} alt="Before" class="media-compare__side-img" />
						<span class="media-compare__tag media-compare__tag--before">Before</span>
					</div>
					<div class="media-compare__side-pane">
						<img src={afterUrl} alt="After" class="media-compare__side-img" />
						<span class="media-compare__tag media-compare__tag--after">After</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Picker strips (only when there's more than one to choose from) -->
		{#if beforeItems.length > 1 || afterItems.length > 1}
			<div class="media-compare__pickers">
				{#if beforeItems.length > 1}
					<div class="media-compare__picker">
						<span class="media-compare__picker-label">Before</span>
						<div class="media-compare__picker-row">
							{#each beforeItems as it (it.id)}
								<button
									type="button"
									class="media-compare__chip"
									class:media-compare__chip--active={beforeId === it.id}
									onclick={() => (beforeId = it.id ?? null)}
									aria-label="Choose before photo"
								>
									{#if it.id && thumbs[it.id]}
										<img src={thumbs[it.id]} alt="" class="media-compare__chip-img" />
									{:else}
										<i class="ri-image-line" aria-hidden="true"></i>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#if afterItems.length > 1}
					<div class="media-compare__picker">
						<span class="media-compare__picker-label">After</span>
						<div class="media-compare__picker-row">
							{#each afterItems as it (it.id)}
								<button
									type="button"
									class="media-compare__chip"
									class:media-compare__chip--active={afterId === it.id}
									onclick={() => (afterId = it.id ?? null)}
									aria-label="Choose after photo"
								>
									{#if it.id && thumbs[it.id]}
										<img src={thumbs[it.id]} alt="" class="media-compare__chip-img" />
									{:else}
										<i class="ri-image-line" aria-hidden="true"></i>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
