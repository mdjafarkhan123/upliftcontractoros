<script lang="ts">
	import { goto } from '$app/navigation';
	import { Briefcase, CalendarPlus } from '@lucide/svelte';
	import { formatTime } from '$lib/utils/calendar';

	let {
		x,
		y,
		start,
		end,
		onClose
	}: {
		x: number;
		y: number;
		start: Date;
		end: Date;
		onClose: () => void;
	} = $props();

	const PANEL_W = 224;
	const PANEL_H = 168;

	// Keep the panel fully on-screen near the pointer.
	const left = $derived(Math.max(8, Math.min(x, window.innerWidth - PANEL_W - 8)));
	const top = $derived(Math.max(8, Math.min(y, window.innerHeight - PANEL_H - 8)));

	function createJob() {
		const params = new URLSearchParams({
			start: start.toISOString(),
			end: end.toISOString()
		});
		onClose();
		void goto(`/appointments/new?${params.toString()}`);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Dismiss layer -->
<button
	type="button"
	class="fixed inset-0 z-50 cursor-default"
	aria-label="Close"
	onclick={onClose}
></button>

<div
	class="fixed z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
	style="left: {left}px; top: {top}px;"
	role="dialog"
	aria-label="Create"
>
	<div class="border-b border-border/60 px-3.5 py-2.5">
		<p class="text-sm font-semibold text-foreground">Create</p>
		<p class="mt-0.5 text-xs text-muted-foreground tabular-nums">
			{formatTime(start)} – {formatTime(end)}
		</p>
	</div>
	<div class="flex flex-col p-1.5">
		<button
			type="button"
			onclick={createJob}
			class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
		>
			<span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
				<Briefcase class="size-4" />
			</span>
			Job
		</button>
		<button
			type="button"
			disabled
			class="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-muted-foreground/60"
		>
			<span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/60">
				<CalendarPlus class="size-4" />
			</span>
			<span class="flex flex-col">
				Event
				<span class="text-[10px] font-normal text-muted-foreground/60">Coming soon</span>
			</span>
		</button>
	</div>
</div>
