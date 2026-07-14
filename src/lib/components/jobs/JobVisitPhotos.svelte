<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/stores/toast.svelte';
	import type { JobVisitPhoto } from '$lib/types/jobs';

	// A photo mid-upload carries a local blob url + `uploading` until the server responds. Mirrors
	// JobFormPhotoField (S4.2b) but posts the `job_visit_photo` tag with line_key = the visit id.
	type EditablePhoto = JobVisitPhoto & { uploading?: boolean };

	let {
		jobId,
		visitId,
		photos: incoming = [],
		canEdit = false,
		cap = 20,
		onAdded,
		onRemoved
	}: {
		jobId: string;
		visitId: string;
		photos?: JobVisitPhoto[];
		canEdit?: boolean;
		cap?: number;
		onAdded: (item: JobVisitPhoto) => void;
		onRemoved: (id: string) => void;
	} = $props();

	// Display list = server-confirmed photos (props) plus any still uploading. Re-seed only when the
	// confirmed set actually changes, preserving in-flight uploads across the re-seed.
	let photos = $state<EditablePhoto[]>([]);
	let seedSig = '';
	$effect(() => {
		const sig = incoming.map((p) => p.id).join('|');
		if (sig === seedSig) return;
		seedSig = sig;
		untrack(() => {
			const inflight = photos.filter((p) => p.uploading);
			photos = [...incoming, ...inflight];
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
		if (files.length > allowed.length) toast.error(`Up to ${cap} photos per visit.`);
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
			fd.append('purpose_tag', 'job_visit_photo');
			fd.append('job_id', jobId);
			fd.append('line_key', visitId);
			const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Upload failed');
			const id = body.data.id as string;
			const urls = await signedUrls(id);
			URL.revokeObjectURL(blob);
			const item: JobVisitPhoto = {
				id,
				thumb_url: urls.thumb ?? blob,
				full_url: urls.full ?? blob
			};
			photos = photos.map((p) => (p.id === tempId ? item : p));
			onAdded(item);
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
			return;
		}
		onRemoved(id);
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

<div class="line-photos">
	{#each photos as p, i (p.id)}
		<div class="line-photos__item">
			<button
				type="button"
				class="line-photos__thumb-btn"
				onclick={() => openLightbox(i)}
				aria-label="View photo"
			>
				<img src={p.thumb_url} alt="" />
			</button>
			{#if p.uploading}
				<div class="line-photos__uploading">
					<i class="ri-loader-4-line" aria-hidden="true"></i>
				</div>
			{:else if canEdit}
				<button
					type="button"
					class="line-photos__remove"
					onclick={() => remove(p.id)}
					aria-label="Delete photo"
				>
					<i class="ri-close-line" aria-hidden="true"></i>
				</button>
			{/if}
		</div>
	{/each}

	{#if canEdit && remaining > 0}
		<button
			type="button"
			class="line-photos__add"
			onclick={pick}
			aria-label="Add photo"
			title="Add photo to this visit"
		>
			<i class="ri-camera-line" aria-hidden="true"></i>
			<span>Photo</span>
		</button>
	{/if}

	{#if photos.length === 0 && !canEdit}
		<p class="line-photos__none">No photos.</p>
	{/if}
</div>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept="image/jpeg,image/png,image/webp"
	class="line-photos__file"
	onchange={onFiles}
/>

<Dialog.Root open={lightboxIndex !== null} onOpenChange={(o) => !o && (lightboxIndex = null)}>
	<Dialog.Content class="quote-doc-lightbox">
		{#if lightboxIndex !== null && photos[lightboxIndex]}
			<div class="quote-doc-lightbox__inner">
				<img src={photos[lightboxIndex].full_url} alt="" />
				{#if photos.length > 1}
					<button
						type="button"
						class="quote-doc-lightbox__nav quote-doc-lightbox__nav--prev"
						onclick={() => step(-1)}
						aria-label="Previous photo"
					>
						<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
					</button>
					<button
						type="button"
						class="quote-doc-lightbox__nav quote-doc-lightbox__nav--next"
						onclick={() => step(1)}
						aria-label="Next photo"
					>
						<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.line-photos {
		&__none {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
		}
	}
</style>
