<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { formatDateInOrgTz } from '$lib/utils/formatInOrgTz';
	import type { JobSignoff } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';

	let {
		jobId,
		signoff,
		canManage
	}: {
		jobId: string;
		signoff: JobSignoff;
		// Edit access to the job (same gate as tasks / visits) — lets this member capture or
		// clear the customer's sign-off.
		canManage: boolean;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);
	const signedLabel = $derived(
		signoff.signed_at ? formatDateInOrgTz(signoff.signed_at, orgTz) : ''
	);

	let signerName = $state('');
	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = false;
	let hasDrawn = $state(false);
	let saving = $state(false);
	let clearing = $state(false);
	let nameError = $state('');

	// Prepare the drawing surface at device pixel ratio for a crisp line, once mounted while
	// there's no captured signature yet (a captured signature shows the image instead of the pad).
	$effect(() => {
		if (!canvas || signoff.signature || !canManage) return;
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
		if (!ctx) return;
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

	async function save() {
		if (saving) return;
		const name = signerName.trim();
		if (!name) {
			nameError = 'A name is required';
			return;
		}
		if (!hasDrawn) {
			toast.error('Please draw the signature first.');
			return;
		}
		nameError = '';
		saving = true;
		let uploadedId: string | null = null;
		try {
			const blob = await toBlob();
			if (!blob) throw new Error('Could not read the signature');
			const file = new File([blob], 'signature.png', { type: 'image/png' });
			const fd = new FormData();
			fd.append('file', file);
			fd.append('purpose_tag', 'job_signoff_signature');
			fd.append('job_id', jobId);
			const up = await fetch('/api/media/upload', { method: 'POST', body: fd });
			const upBody = await up.json().catch(() => ({}));
			if (!up.ok) throw new Error(upBody.error ?? 'Could not save signature');
			uploadedId = upBody.data.id as string;

			const res = await fetch(`/api/jobs/${jobId}/signoff`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ signer_name: name })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (body.field_errors?.signer_name) nameError = body.field_errors.signer_name;
				throw new Error(body.error ?? 'Could not save sign-off');
			}
			jobDetailStore.patch(jobId, (prev) => ({ ...prev, signoff: body.data.signoff }));
			signerName = '';
			hasDrawn = false;
			toast.success('Sign-off saved.');
		} catch (err) {
			// Roll back the just-uploaded image so no orphan signature is left on the job.
			if (uploadedId) {
				await fetch(`/api/jobs/${jobId}/signoff`, { method: 'DELETE' }).catch(() => {});
			}
			toast.error(err instanceof Error ? err.message : 'Could not save sign-off');
		} finally {
			saving = false;
		}
	}

	async function clearSaved() {
		if (clearing) return;
		clearing = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/signoff`, { method: 'DELETE' });
			if (!res.ok) throw new Error();
			jobDetailStore.patch(jobId, (prev) => ({
				...prev,
				signoff: { signer_name: null, signed_at: null, signature: null }
			}));
		} catch {
			toast.error('Could not clear the sign-off');
		} finally {
			clearing = false;
		}
	}
</script>

<section class="job-section job-signoff">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-quill-pen-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Client sign-off</h2>
		</div>
		{#if signoff.signature}
			<span class="job-signoff__badge">
				<i class="ri-checkbox-circle-fill" aria-hidden="true"></i>
				Signed
			</span>
		{/if}
	</div>

	{#if signoff.signature}
		<!-- Captured: read-only proof of the customer's approval. -->
		<div class="job-signoff__captured">
			<img class="job-signoff__image" src={signoff.signature.full_url} alt="Client signature" />
			<p class="job-signoff__signed-by">
				Signed{signoff.signer_name ? ` by ${signoff.signer_name}` : ''}{signedLabel
					? ` on ${signedLabel}`
					: ''}
			</p>
			{#if canManage}
				<Button variant="ghost" size="sm" loading={clearing} onclick={clearSaved}>
					<i class="ri-eraser-line" aria-hidden="true"></i>
					Clear &amp; redo
				</Button>
			{/if}
		</div>
	{:else if canManage}
		<!-- Capture: hand the device to the customer to sign. -->
		<p class="job-signoff__hint">
			Have the customer confirm the work is complete, then sign below.
		</p>
		<div class="field">
			<label class="field__label" for="signoff-name">Signed by</label>
			<input
				id="signoff-name"
				class="field__input"
				type="text"
				maxlength="120"
				placeholder="Customer's full name"
				bind:value={signerName}
			/>
			{#if nameError}
				<p class="job-signoff__error" role="alert">{nameError}</p>
			{/if}
		</div>
		<canvas
			bind:this={canvas}
			class="job-signoff__pad"
			onpointerdown={start}
			onpointermove={move}
			onpointerup={end}
			onpointercancel={end}
			onpointerleave={end}
		></canvas>
		<div class="job-signoff__actions">
			<Button variant="ghost" size="sm" onclick={clearPad} disabled={!hasDrawn || saving}>
				Clear
			</Button>
			<Button size="sm" loading={saving} onclick={save}>
				Save sign-off
			</Button>
		</div>
	{:else}
		<p class="job-signoff__hint">Not signed yet.</p>
	{/if}
</section>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-signoff {
		&__badge {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-size: $fs-body;
			font-weight: 600;
			color: var(--color-success-fg, #15803d);

			i {
				color: var(--color-success, #16a34a);
			}
		}

		&__hint {
			margin: 0 0 $space-3;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__captured {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: $space-2;
		}

		&__image {
			max-width: 360px;
			max-height: 140px;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: #fff;
			object-fit: contain;
		}

		&__signed-by {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text);
		}

		&__pad {
			width: 100%;
			max-width: 360px;
			height: 140px;
			margin-top: $space-3;
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			touch-action: none;
			cursor: crosshair;
		}

		&__actions {
			display: flex;
			gap: $space-2;
			margin-top: $space-2;
		}

		&__error {
			margin: $space-1 0 0;
			font-size: $fs-body;
			color: var(--color-danger, #dc2626);
		}
	}
</style>
