<script lang="ts">
	import { FileText, Loader2, Download } from '@lucide/svelte';
	import MediaLightbox from '$lib/components/media/MediaLightbox.svelte';
	import type { LocalMediaItem } from '$lib/components/media/types';
	import type { MessageMedia } from '$lib/stores/inbox.svelte';
	import { cn } from '$lib/utils/cn';

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
		class={cn(
			'mb-1.5 grid gap-1.5',
			images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
			align === 'end' ? 'justify-items-end' : 'justify-items-start'
		)}
	>
		{#each images as img, i (img.id)}
			<button
				type="button"
				onclick={() => (lightboxIndex = i)}
				class="group relative aspect-square w-full max-w-[200px] overflow-hidden rounded-xl bg-muted ring-1 ring-border/50 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`View ${img.original_filename}`}
			>
				{#if thumbUrls[img.id]}
					<img
						src={thumbUrls[img.id]}
						alt={img.original_filename}
						class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
						loading="lazy"
					/>
				{:else}
					<div class="flex h-full w-full items-center justify-center">
						<Loader2 class="h-5 w-5 animate-spin text-muted-foreground/60" />
					</div>
				{/if}
			</button>
		{/each}
	</div>
{/if}

{#if files.length > 0}
	<div class={cn('mb-1.5 flex flex-col gap-1.5', align === 'end' ? 'items-end' : 'items-start')}>
		{#each files as file (file.id)}
			<button
				type="button"
				onclick={() => openFile(file.id)}
				class="inline-flex max-w-[240px] items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
				<span class="min-w-0 flex-1">
					<span class="block truncate text-xs font-medium text-foreground"
						>{file.original_filename}</span
					>
					<span class="block text-[10px] text-muted-foreground"
						>{formatSize(file.file_size_bytes)}</span
					>
				</span>
				<Download class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			</button>
		{/each}
	</div>
{/if}

<MediaLightbox
	items={lightboxItems}
	bind:activeIndex={lightboxIndex}
	onClose={() => (lightboxIndex = -1)}
/>
