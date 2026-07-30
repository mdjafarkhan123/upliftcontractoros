<script lang="ts">
	// The ONE draw-with-your-finger signature surface. Encapsulates the DPR-crisp canvas + pointer
	// drawing shared by the quote in-person sign dialog, the job-form signature field, and the
	// invoice sign dialog. It owns ONLY the drawing — each caller keeps its own upload/submit logic
	// and reads the result via `hasDrawn` + the exported `toBlob()` / `clear()`.
	let {
		disabled = false,
		strokeColor = '#0f172a',
		showClear = true,
		hasDrawn = $bindable(false),
		class: className = ''
	}: {
		disabled?: boolean;
		strokeColor?: string;
		showClear?: boolean;
		hasDrawn?: boolean;
		class?: string;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = null;
	let drawing = false;

	// Prepare the drawing surface at device pixel ratio for a crisp line once the pad mounts.
	$effect(() => {
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		const c = canvas.getContext('2d');
		if (!c) return;
		c.scale(dpr, dpr);
		c.lineWidth = 2.5;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.strokeStyle = strokeColor;
		ctx = c;
		hasDrawn = false;
	});

	function point(e: PointerEvent): { x: number; y: number } {
		const rect = canvas!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}
	function start(e: PointerEvent) {
		if (!ctx || disabled) return;
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

	// Wipe the pad. Exposed to callers via bind:this (e.g. a "Clear & redo" from the parent).
	export function clear() {
		if (!ctx || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
		hasDrawn = false;
	}
	// Read the drawn signature as a PNG blob. Null when the pad never mounted.
	export function toBlob(): Promise<Blob | null> {
		if (!canvas) return Promise.resolve(null);
		return new Promise((resolve) => canvas!.toBlob((b) => resolve(b), 'image/png'));
	}
</script>

<div class="signature-pad {className}">
	<canvas
		bind:this={canvas}
		class="signature-pad__canvas"
		class:signature-pad__canvas--disabled={disabled}
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
		onpointerleave={end}
	></canvas>
	{#if showClear}
		<button
			type="button"
			class="signature-pad__clear"
			onclick={clear}
			disabled={!hasDrawn || disabled}
		>
			<i class="ri-eraser-line" aria-hidden="true"></i> Clear
		</button>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.signature-pad {
		display: flex;
		flex-direction: column;
		gap: $space-2;

		&__canvas {
			width: 100%;
			height: 200px;
			// White "paper" the customer signs on — intentionally light in both themes (ink on paper),
			// dashed to read as a draw-here affordance.
			border: 2px dashed var(--color-border-strong);
			border-radius: $radius-md;
			background: #fff;
			touch-action: none;
			cursor: crosshair;

			&--disabled {
				cursor: not-allowed;
				opacity: 0.6;
			}
		}

		&__clear {
			align-self: flex-end;
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			padding: 0;
			border: none;
			background: none;
			font-size: $fs-caption;
			color: var(--color-text-muted);
			cursor: pointer;

			&:hover:not(:disabled) {
				color: var(--color-text);
			}
			&:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}
		}
	}
</style>
