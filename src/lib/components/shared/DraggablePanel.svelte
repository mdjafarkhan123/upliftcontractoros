<script lang="ts">
	import type { Snippet } from 'svelte';

	// A single, reusable free-floating popup shell (Jobber-style): opens beside an
	// anchor element or near a click point, then can be dragged anywhere by its top
	// bar. Non-modal — the app behind stays interactive; clicking outside closes it.
	// Used by the calendar's quick-create and card-detail popups, and reusable by any
	// other entity that needs a movable preview/create bubble.
	let {
		// Placement (pick one). anchorEl → open beside the element (right, flips left
		// on overflow). point → open near a screen coordinate. Neither → screen center.
		anchorEl = null,
		point = null,
		width,
		ariaLabel = 'Dialog',
		// When false, clicks outside no longer close (rare — most popups want true).
		closeOnOutsideClick = true,
		onClose,
		heading,
		children
	}: {
		anchorEl?: HTMLElement | null;
		point?: { x: number; y: number } | null;
		width?: string;
		ariaLabel?: string;
		closeOnOutsideClick?: boolean;
		onClose: () => void;
		// Left side of the drag bar (e.g. a type badge or heading). Named `heading`, not
		// `title`, so consumers can keep a `title` state variable without the snippet
		// shadowing it (that shadowing broke QuickCreatePopover's title input).
		heading?: Snippet;
		children: Snippet;
	} = $props();

	const MARGIN = 12; // keep this far from the viewport edge
	const GAP = 10; // gap between the panel and its anchor / point

	let panelEl = $state<HTMLElement | null>(null);
	// Fixed left/top in px. null until measured — panel stays hidden to avoid a flash.
	let pos = $state<{ x: number; y: number } | null>(null);
	let placed = false;

	let dragging = $state(false);
	let dragStart = { px: 0, py: 0, x: 0, y: 0 };

	function clamp(x: number, y: number, w: number, h: number) {
		const maxX = window.innerWidth - w - MARGIN;
		const maxY = window.innerHeight - h - MARGIN;
		return {
			x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, maxX)),
			y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, maxY))
		};
	}

	// Place once, after the panel is in the DOM and can be measured.
	$effect(() => {
		if (placed || !panelEl) return;
		const rect = panelEl.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		let x: number;
		let y: number;
		if (anchorEl) {
			const a = anchorEl.getBoundingClientRect();
			x = a.right + GAP;
			if (x + w + MARGIN > window.innerWidth) x = a.left - w - GAP;
			y = a.top;
		} else if (point) {
			x = point.x + GAP;
			y = point.y + GAP;
		} else {
			x = (window.innerWidth - w) / 2;
			y = (window.innerHeight - h) / 2;
		}
		pos = clamp(x, y, w, h);
		placed = true;
	});

	function onHandlePointerDown(e: PointerEvent) {
		if (e.button !== 0 || !pos) return;
		// Don't hijack pointerdowns that land on an interactive control in the bar
		// (the close "X"). Capturing the pointer here would swallow its click, so the
		// Close/Cancel button would never fire.
		if ((e.target as HTMLElement).closest('button')) return;
		dragging = true;
		dragStart = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function onHandlePointerMove(e: PointerEvent) {
		if (!dragging || !panelEl) return;
		const rect = panelEl.getBoundingClientRect();
		const nx = dragStart.x + (e.clientX - dragStart.px);
		const ny = dragStart.y + (e.clientY - dragStart.py);
		pos = clamp(nx, ny, rect.width, rect.height);
	}

	function onHandlePointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (!closeOnOutsideClick || dragging || !panelEl) return;
		const target = e.target as HTMLElement | null;
		if (!target) return;
		// Not an outside click when the pointer lands inside:
		//  - the panel itself,
		//  - a bits-ui floating dropdown it opened (ContactPicker / date & time pickers
		//    portal to <body> → [data-bits-floating-content-wrapper]),
		//  - a bits-ui modal Dialog / AlertDialog opened from within the panel (e.g. the
		//    RequestConvertDialog). These portal to <body> WITHOUT the floating wrapper, so
		//    without this a click on the dialog would read as "outside" and tear the panel
		//    (and the dialog) down before the button's click fires — a silent no-op.
		if (
			panelEl.contains(target) ||
			target.closest(
				'[data-bits-floating-content-wrapper],[data-dialog-content],[data-dialog-overlay],[data-alert-dialog-content],[data-alert-dialog-overlay]'
			)
		)
			return;
		onClose();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onKeydown} />

<div
	bind:this={panelEl}
	class="drag-panel"
	class:drag-panel--dragging={dragging}
	role="dialog"
	aria-label={ariaLabel}
	style:left={pos ? `${pos.x}px` : '0'}
	style:top={pos ? `${pos.y}px` : '0'}
	style:width
	style:visibility={pos ? 'visible' : 'hidden'}
>
	<div
		class="drag-panel__bar"
		onpointerdown={onHandlePointerDown}
		onpointermove={onHandlePointerMove}
		onpointerup={onHandlePointerUp}
		role="presentation"
	>
		<div class="drag-panel__title">
			{#if heading}{@render heading()}{/if}
		</div>
		<span class="drag-panel__grip" aria-hidden="true">
			<i class="ri-draggable"></i>
		</span>
		<button type="button" class="drag-panel__close" aria-label="Close" onclick={onClose}>
			<i class="ri-close-line" aria-hidden="true"></i>
		</button>
	</div>

	<div class="drag-panel__body">
		{@render children()}
	</div>
</div>
