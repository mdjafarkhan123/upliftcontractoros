<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { Button } from '$lib/components/ui/button';
	import SignaturePad from '$lib/components/shared/SignaturePad.svelte';
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

	let pad: SignaturePad | undefined = $state();
	let hasDrawn = $state(false);
	let saving = $state(false);
	let clearing = $state(false);

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
			const blob = await (pad?.toBlob() ?? Promise.resolve(null));
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
		<SignaturePad bind:this={pad} bind:hasDrawn disabled={!canEdit || saving} showClear={false} />
		<div class="sig-field__actions">
			<Button
				variant="ghost"
				size="sm"
				onclick={() => pad?.clear()}
				disabled={!hasDrawn || saving}
			>
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
