<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { JobFormFieldMedia } from '$lib/types/jobs';

	let {
		jobId,
		fieldId,
		signature = null,
		canEdit = false,
		onSaved,
		onCleared
	}: {
		jobId: string;
		fieldId: string;
		// The single captured signature for this field, or null when none yet.
		signature?: JobFormFieldMedia | null;
		canEdit?: boolean;
		onSaved: (item: JobFormFieldMedia) => void;
		onCleared: (id: string) => void;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = false;
	let hasDrawn = $state(false);
	let saving = $state(false);
	let clearing = $state(false);

	// Prepare the drawing surface at device pixel ratio for a crisp line, once mounted with no
	// saved signature (a saved signature shows the image instead of the pad).
	$effect(() => {
		if (!canvas || signature) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		const c = canvas.getContext('2d');
		if (!c) return;
		c.scale(dpr, dpr);
		c.lineWidth = 2;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.strokeStyle = '#0f172a';
		ctx = c;
	});

	function point(e: PointerEvent): { x: number; y: number } {
		const rect = canvas!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function start(e: PointerEvent) {
		if (!ctx || !canEdit) return;
		drawing = true;
		canvas!.setPointerCapture(e.pointerId);
		const p = point(e);
		ctx.beginPath();
		ctx.moveTo(p.x, p.y);
	}

	function move(e: PointerEvent) {
		if (!drawing || !ctx) return;
		const p = point(e);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
		hasDrawn = true;
	}

	function end(e: PointerEvent) {
		if (!drawing) return;
		drawing = false;
		try {
			canvas!.releasePointerCapture(e.pointerId);
		} catch {
			/* pointer already released */
		}
	}

	function clearPad() {
		if (!ctx || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
		hasDrawn = false;
	}

	function toBlob(): Promise<Blob | null> {
		return new Promise((resolve) => canvas!.toBlob((b) => resolve(b), 'image/png'));
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

	async function save() {
		if (!hasDrawn || saving) return;
		saving = true;
		try {
			const blob = await toBlob();
			if (!blob) throw new Error('Could not read the signature');
			const file = new File([blob], 'signature.png', { type: 'image/png' });
			const fd = new FormData();
			fd.append('file', file);
			fd.append('purpose_tag', 'job_form_signature');
			fd.append('job_id', jobId);
			fd.append('line_key', fieldId);
			const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Could not save signature');
			const id = body.data.id as string;
			const urls = await signedUrls(id);
			onSaved({
				id,
				purpose_tag: 'job_form_signature',
				thumb_url: urls.thumb ?? '',
				full_url: urls.full ?? ''
			});
			hasDrawn = false;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not save signature');
		} finally {
			saving = false;
		}
	}

	async function clearSaved() {
		if (!signature || clearing) return;
		clearing = true;
		try {
			const res = await fetch(`/api/media/${signature.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error();
			onCleared(signature.id);
		} catch {
			toast.error('Could not clear the signature');
		} finally {
			clearing = false;
		}
	}
</script>

{#if signature}
	<div class="sig-field">
		<img class="sig-field__saved" src={signature.full_url || signature.thumb_url} alt="Signature" />
		{#if canEdit}
			<Button variant="ghost" size="sm" loading={clearing} onclick={clearSaved}>
				<i class="ri-eraser-line" aria-hidden="true"></i>
				Clear &amp; redo
			</Button>
		{/if}
	</div>
{:else if canEdit}
	<div class="sig-field">
		<canvas
			bind:this={canvas}
			class="sig-field__pad"
			onpointerdown={start}
			onpointermove={move}
			onpointerup={end}
			onpointercancel={end}
			onpointerleave={end}
		></canvas>
		<div class="sig-field__actions">
			<Button variant="ghost" size="sm" onclick={clearPad} disabled={!hasDrawn || saving}>
				Clear
			</Button>
			<Button size="sm" loading={saving} disabled={!hasDrawn} onclick={save}>Save signature</Button>
		</div>
	</div>
{:else}
	<p class="sig-field__none">Not signed.</p>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.sig-field {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: $space-2;

		&__pad {
			width: 100%;
			max-width: 360px;
			height: 140px;
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			touch-action: none;
			cursor: crosshair;
		}

		&__saved {
			max-width: 360px;
			max-height: 140px;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: #fff;
			object-fit: contain;
		}

		&__actions {
			display: flex;
			gap: $space-2;
		}

		&__none {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-muted);
			font-style: italic;
		}
	}
</style>
