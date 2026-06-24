<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import { ImagePlus, X, Loader2, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import type { QuoteLinePhoto } from '$lib/types/quotes';

	// A photo in the editor, possibly mid-upload. thumb/full_url may be a local blob while
	// uploading, swapped for signed R2 URLs once the server responds.
	type EditablePhoto = QuoteLinePhoto & { uploading?: boolean };

	let {
		quoteId,
		lineKey,
		initialPhotos = [],
		canEdit = false,
		cap = 6
	}: {
		quoteId: string;
		lineKey: string;
		initialPhotos?: QuoteLinePhoto[];
		canEdit?: boolean;
		cap?: number;
	} = $props();

	let photos = $state<EditablePhoto[]>([]);
	let seedSig = '';

	// Seed from the parent-provided list, re-seeding only when the server set actually changes
	// (e.g. after a save/refresh). In-flight uploads are preserved across a re-seed.
	$effect(() => {
		const sig = initialPhotos.map((p) => p.id).join('|');
		if (sig === seedSig) return;
		seedSig = sig;
		untrack(() => {
			const inflight = photos.filter((p) => p.uploading);
			photos = [...initialPhotos, ...inflight];
		});
	});

	let fileInput: HTMLInputElement | undefined = $state();
	let lightboxIndex = $state<number | null>(null);

	const remaining = $derived(Math.max(0, cap - photos.length));

	function pick() {
		if (!canEdit || remaining === 0) return;
		fileInput?.click();
	}

	function onFiles(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const files = Array.from(target.files ?? []);
		target.value = '';
		if (files.length === 0) return;
		const allowed = files.slice(0, remaining);
		if (files.length > allowed.length) {
			toast.error(`Up to ${cap} photos per line item.`);
		}
		for (const f of allowed) void uploadOne(f);
	}

	async function signedUrls(id: string): Promise<{ thumb?: string; full?: string }> {
		const [t, w] = await Promise.all([
			fetch(`/api/media/${id}/url?variant=thumbnail`)
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null),
			fetch(`/api/media/${id}/url?variant=web`)
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null)
		]);
		return { thumb: t?.data?.url, full: w?.data?.url };
	}

	async function uploadOne(file: File) {
		const tempId = `tmp-${crypto.randomUUID()}`;
		const blob = URL.createObjectURL(file);
		photos = [...photos, { id: tempId, thumb_url: blob, full_url: blob, uploading: true }];
		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('purpose_tag', 'quote_line_item_photo');
			fd.append('quote_id', quoteId);
			fd.append('line_key', lineKey);
			const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Upload failed');
			const id = body.data.id as string;
			const urls = await signedUrls(id);
			URL.revokeObjectURL(blob);
			photos = photos.map((p) =>
				p.id === tempId ? { id, thumb_url: urls.thumb ?? blob, full_url: urls.full ?? blob } : p
			);
		} catch (err) {
			URL.revokeObjectURL(blob);
			photos = photos.filter((p) => p.id !== tempId);
			toast.error(err instanceof Error ? err.message : 'Upload failed');
		}
	}

	async function remove(id: string) {
		const prev = photos;
		photos = photos.filter((p) => p.id !== id);
		const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			photos = prev;
			toast.error('Could not delete photo');
		}
	}

	function openLightbox(i: number) {
		lightboxIndex = i;
	}
	function step(dir: -1 | 1) {
		if (lightboxIndex === null) return;
		const n = photos.length;
		lightboxIndex = (lightboxIndex + dir + n) % n;
	}
</script>

{#if photos.length > 0 || canEdit}
	<div class="mt-2 flex flex-wrap items-center gap-2">
		{#each photos as p, i (p.id)}
			<div class="group relative h-14 w-14 overflow-hidden rounded-lg border border-border/60">
				<button
					type="button"
					class="h-full w-full"
					onclick={() => openLightbox(i)}
					aria-label="View photo"
				>
					<img src={p.thumb_url} alt="" class="h-full w-full object-cover" />
				</button>
				{#if p.uploading}
					<div class="absolute inset-0 flex items-center justify-center bg-background/50">
						<Loader2 class="h-4 w-4 animate-spin text-foreground" />
					</div>
				{:else if canEdit}
					<button
						type="button"
						class="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100"
						onclick={() => remove(p.id)}
						aria-label="Delete photo"
					>
						<X class="h-3 w-3" />
					</button>
				{/if}
			</div>
		{/each}

		{#if canEdit && remaining > 0}
			<button
				type="button"
				class={cn(
					'flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 hover:text-foreground'
				)}
				onclick={pick}
				aria-label="Add photo"
				title="Add photo to this line"
			>
				<ImagePlus class="h-4 w-4" />
				<span class="text-[10px] font-medium">Photo</span>
			</button>
		{/if}
	</div>

	<input
		bind:this={fileInput}
		type="file"
		multiple
		accept="image/jpeg,image/png,image/webp"
		class="hidden"
		onchange={onFiles}
	/>
{/if}

<Dialog.Root open={lightboxIndex !== null} onOpenChange={(o) => !o && (lightboxIndex = null)}>
	<Dialog.Content class="max-w-3xl border-0 bg-transparent p-0 shadow-none">
		{#if lightboxIndex !== null && photos[lightboxIndex]}
			<div class="relative flex items-center justify-center">
				<img
					src={photos[lightboxIndex].full_url}
					alt=""
					class="max-h-[80vh] w-auto rounded-lg object-contain"
				/>
				{#if photos.length > 1}
					<button
						type="button"
						class="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md hover:bg-background"
						onclick={() => step(-1)}
						aria-label="Previous photo"
					>
						<ChevronLeft class="h-5 w-5" />
					</button>
					<button
						type="button"
						class="absolute right-2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md hover:bg-background"
						onclick={() => step(1)}
						aria-label="Next photo"
					>
						<ChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
