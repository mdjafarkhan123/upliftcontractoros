<script lang="ts">
	import MediaLightbox from '$lib/components/media/MediaLightbox.svelte';
	import type { LocalMediaItem } from '$lib/components/media/types';
	import type { MessageMedia } from '$lib/stores/inbox.svelte';

	let { media, align = 'start' }: { media: MessageMedia[]; align?: 'start' | 'end' } = $props();

	const images = $derived(media.filter((m) => m.media_type === 'photo'));
	const files = $derived(media.filter((m) => m.media_type !== 'photo'));

	// Lazy-loaded presigned thumbnail URLs, keyed by media id.
	let thumbUrls = $state<Record<string, string>>({});
	let lightboxIndex = $state(-1);

	const lightboxItems = $derived<LocalMediaItem[]>(
		images.map((m) => ({
			localId: m.id,
			id: m.id,
			status: 'done' as const,
			r2_key: m.r2_key,
			thumbnail_key: m.thumbnail_key,
			web_key: m.web_key,
			original_filename: m.original_filename,
			file_size_bytes: m.file_size_bytes,
			media_type: m.media_type,
			mime_type: m.mime_type,
			created_at: m.created_at
		}))
	);

	async function loadThumb(id: string) {
		if (thumbUrls[id]) return;
		try {
			const res = await fetch(`/api/media/${id}/url?variant=thumbnail`);
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { url: string } };
			if (body.data?.url) thumbUrls = { ...thumbUrls, [id]: body.data.url };
		} catch {
			// silent — placeholder stays
		}
	}

	$effect(() => {
		for (const img of images) void loadThumb(img.id);
	});

	async function openFile(id: string) {
		try {
			const res = await fetch(`/api/media/${id}/url?variant=original`);
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { url: string } };
			if (body.data?.url) window.open(body.data.url, '_blank', 'noopener');
		} catch {
			// silent
		}
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

{#if images.length > 0}
	<div
		class="msg-media__grid msg-media__grid--{images.length === 1
			? 'single'
			: 'multi'} msg-media__grid--{align}"
	>
		{#each images as img, i (img.id)}
			<button
				type="button"
				onclick={() => (lightboxIndex = i)}
				class="msg-media__thumb"
				aria-label={`View ${img.original_filename}`}
			>
				{#if thumbUrls[img.id]}
					<img src={thumbUrls[img.id]} alt={img.original_filename} loading="lazy" />
				{:else}
					<div class="msg-media__thumb-loading">
						<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
					</div>
				{/if}
			</button>
		{/each}
	</div>
{/if}

{#if files.length > 0}
	<div class="msg-media__files msg-media__files--{align}">
		{#each files as file (file.id)}
			<button type="button" onclick={() => openFile(file.id)} class="msg-media__file">
				<i class="ri-file-text-line msg-media__file-icon" aria-hidden="true"></i>
				<span class="msg-media__file-info">
					<span class="msg-media__file-name">{file.original_filename}</span>
					<span class="msg-media__file-size">{formatSize(file.file_size_bytes)}</span>
				</span>
				<i class="ri-download-line msg-media__file-dl" aria-hidden="true"></i>
			</button>
		{/each}
	</div>
{/if}

<MediaLightbox
	items={lightboxItems}
	bind:activeIndex={lightboxIndex}
	onClose={() => (lightboxIndex = -1)}
/>
