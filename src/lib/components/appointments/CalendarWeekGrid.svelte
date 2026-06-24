<script lang="ts">
	import { addDays, dayKey, isSameDay } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { cn } from '$lib/utils/cn';
	import type { AppointmentDetail, AppointmentListItem } from '$lib/types/appointments';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import QuickCreatePopover from './QuickCreatePopover.svelte';

	let {
		anchor,
		items,
		dayStartHour,
		dayEndHour,
		canCreate,
		canReschedule = false
	}: {
		anchor: Date;
		items: AppointmentListItem[];
		dayStartHour: number;
		dayEndHour: number;
		canCreate: boolean;
		canReschedule?: boolean;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	const HOUR_HEIGHT = 56; // px
	const TOP_GUTTER = 10; // px — breathing room so the first hour label clears the sticky day-header
	const DEFAULT_DURATION_MIN = 60;
	const SNAP_MINUTES = 15;
	const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

	// Extract { hour, minute } in the org's timezone so an event scheduled at 9am
	// org-time renders at the 9am grid line regardless of the user's browser tz.
	function partsInOrgTz(d: Date, tz: string | undefined): { hour: number; minute: number } {
		try {
			const fmt = new Intl.DateTimeFormat('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone: tz || undefined
			});
			const parts = fmt.formatToParts(d);
			const h = Number(parts.find((p) => p.type === 'hour')?.value ?? d.getHours());
			const m = Number(parts.find((p) => p.type === 'minute')?.value ?? d.getMinutes());
			return { hour: h === 24 ? 0 : h, minute: m };
		} catch {
			return { hour: d.getHours(), minute: d.getMinutes() };
		}
	}

	function tzDateKey(d: Date, tz: string | undefined): string {
		try {
			const fmt = new Intl.DateTimeFormat('en-CA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				timeZone: tz || undefined
			});
			return fmt.format(d);
		} catch {
			return dayKey(d);
		}
	}

	const today = new Date();

	type LaidOut = {
		item: AppointmentListItem;
		startMin: number;
		endMin: number;
		col: number;
		cols: number;
	};

	type DayLane = {
		date: Date;
		key: string;
		laidOut: LaidOut[];
	};

	function layoutDay(
		dayItems: { item: AppointmentListItem; startMin: number; endMin: number }[]
	): LaidOut[] {
		const sorted = [...dayItems].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
		const colEnds: number[] = [];
		const assigned: LaidOut[] = [];
		for (const ev of sorted) {
			let col = colEnds.findIndex((end) => end <= ev.startMin);
			if (col === -1) {
				col = colEnds.length;
				colEnds.push(ev.endMin);
			} else {
				colEnds[col] = ev.endMin;
			}
			assigned.push({ item: ev.item, startMin: ev.startMin, endMin: ev.endMin, col, cols: 1 });
		}
		// Cluster pass: connected components of time overlap.
		let i = 0;
		while (i < assigned.length) {
			let j = i;
			let clusterEnd = assigned[i].endMin;
			let maxCol = assigned[i].col;
			while (j + 1 < assigned.length && assigned[j + 1].startMin < clusterEnd) {
				j++;
				clusterEnd = Math.max(clusterEnd, assigned[j].endMin);
				maxCol = Math.max(maxCol, assigned[j].col);
			}
			const size = maxCol + 1;
			for (let k = i; k <= j; k++) assigned[k].cols = size;
			i = j + 1;
		}
		return assigned;
	}

	const days = $derived.by<DayLane[]>(() => {
		const buckets = new Map<
			string,
			{ item: AppointmentListItem; startMin: number; endMin: number }[]
		>();
		for (let i = 0; i < 7; i++) {
			buckets.set(dayKey(addDays(anchor, i)), []);
		}
		for (const item of items) {
			const start = new Date(item.scheduled_start);
			const end = item.scheduled_end ? new Date(item.scheduled_end) : null;
			const { hour: sh, minute: sm } = partsInOrgTz(start, orgTz);
			const startMin = sh * 60 + sm;
			let endMin: number;
			if (end) {
				const { hour: eh, minute: em } = partsInOrgTz(end, orgTz);
				endMin = eh * 60 + em;
				if (endMin <= startMin) endMin = startMin + DEFAULT_DURATION_MIN;
			} else {
				endMin = startMin + DEFAULT_DURATION_MIN;
			}
			// Map event to its day in org tz, then match the corresponding anchor-relative bucket key.
			const tzKey = tzDateKey(start, orgTz);
			// Find which anchor day this matches.
			for (let i = 0; i < 7; i++) {
				const d = addDays(anchor, i);
				if (tzDateKey(d, orgTz) === tzKey) {
					const k = dayKey(d);
					buckets.get(k)?.push({ item, startMin, endMin });
					break;
				}
			}
		}
		const out: DayLane[] = [];
		for (let i = 0; i < 7; i++) {
			const d = addDays(anchor, i);
			const k = dayKey(d);
			out.push({ date: d, key: k, laidOut: layoutDay(buckets.get(k) ?? []) });
		}
		return out;
	});

	// Compute visible hour range: prefer org hours but expand to include any event.
	const range = $derived.by(() => {
		let minH = dayStartHour;
		let maxH = dayEndHour;
		for (const day of days) {
			for (const ev of day.laidOut) {
				const eventStartH = Math.floor(ev.startMin / 60);
				const eventEndH = Math.ceil(ev.endMin / 60);
				if (eventStartH < minH) minH = eventStartH;
				if (eventEndH > maxH) maxH = eventEndH;
			}
		}
		minH = Math.max(0, Math.min(23, minH));
		maxH = Math.max(minH + 1, Math.min(24, maxH));
		return { startMin: minH * 60, endMin: maxH * 60, hours: maxH - minH, startHour: minH };
	});

	const hourLabels = $derived.by(() => {
		const out: { hour: number; label: string; isOffHours: boolean }[] = [];
		for (let h = range.startHour; h < range.startHour + range.hours; h++) {
			const isOff = h < dayStartHour || h >= dayEndHour;
			const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
			out.push({ hour: h, label, isOffHours: isOff });
		}
		return out;
	});

	function pxFromMin(min: number): number {
		return ((min - range.startMin) / 60) * HOUR_HEIGHT + TOP_GUTTER;
	}

	// Live "now" line — ticks every minute.
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(id);
	});

	const nowParts = $derived(partsInOrgTz(now, orgTz));
	const nowMin = $derived(nowParts.hour * 60 + nowParts.minute);
	const nowVisible = $derived(nowMin >= range.startMin && nowMin <= range.endMin);

	// ── Coordinate / time helpers ───────────────────────────────────────────
	const DRAG_THRESHOLD = 4; // px before a pointerdown becomes a drag

	let gridBodyEl = $state<HTMLDivElement | null>(null);

	function clampDayMin(min: number): number {
		return Math.max(0, Math.min(24 * 60, min));
	}

	function snapMin(min: number): number {
		return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
	}

	// Convert a viewport Y into a minute-of-day on the visible grid (inverts
	// pxFromMin, accounting for TOP_GUTTER and the scroll position via getBoundingClientRect).
	function minFromClientY(clientY: number): number {
		if (!gridBodyEl) return range.startMin;
		const rect = gridBodyEl.getBoundingClientRect();
		const y = clientY - rect.top - TOP_GUTTER;
		return range.startMin + (y / HOUR_HEIGHT) * 60;
	}

	// Which day column is under the pointer (cross-column move). -1 if none.
	function colFromPoint(clientX: number, clientY: number): number {
		const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
		const col = el?.closest('[data-col-index]') as HTMLElement | null;
		if (!col) return -1;
		return Number(col.getAttribute('data-col-index'));
	}

	function labelForMin(min: number): string {
		const h = Math.floor(min / 60) % 24;
		const m = ((min % 60) + 60) % 60;
		const ampm = h < 12 ? 'AM' : 'PM';
		const h12 = h % 12 === 0 ? 12 : h % 12;
		return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	// Offset (ms) of an IANA tz at a given UTC instant.
	function tzOffsetMs(utcMs: number, tz: string): number {
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		const m: Record<string, number> = {};
		for (const p of dtf.formatToParts(new Date(utcMs))) {
			if (p.type !== 'literal') m[p.type] = Number(p.value);
		}
		const h = m.hour === 24 ? 0 : m.hour;
		const asUtc = Date.UTC(m.year, m.month - 1, m.day, h, m.minute, m.second);
		return asUtc - utcMs;
	}

	// Build the absolute instant for a wall-clock time on the org-tz calendar day
	// that `day`'s column represents. Used by reschedule so a block dropped on
	// "9 AM Tue" saves as 9 AM org-time (DST-correct), matching how the grid buckets.
	function wallClockToUtc(day: Date, totalMin: number, tz: string | undefined): Date {
		const hour = Math.floor(totalMin / 60);
		const minute = totalMin % 60;
		let y: number;
		let mo: number;
		let d: number;
		if (tz) {
			const [yy, mm, dd] = tzDateKey(day, tz).split('-').map(Number);
			y = yy;
			mo = mm - 1;
			d = dd;
		} else {
			y = day.getFullYear();
			mo = day.getMonth();
			d = day.getDate();
		}
		const guess = Date.UTC(y, mo, d, hour, minute, 0, 0);
		const off1 = tzOffsetMs(guess, tz ?? 'UTC');
		if (!tz) return new Date(y, mo, d, hour, minute, 0, 0);
		let result = guess - off1;
		const off2 = tzOffsetMs(result, tz);
		if (off2 !== off1) result = guess - off2;
		return new Date(result);
	}

	// ── Drag state machine ──────────────────────────────────────────────────
	type DragState = {
		mode: 'create' | 'move' | 'resize';
		pointerId: number;
		startClientX: number;
		startClientY: number;
		moved: boolean;
		colIndex: number;
		ghostStartMin: number;
		ghostEndMin: number;
		anchorMin?: number; // create: where the drag began
		item?: AppointmentListItem; // move / resize
		durationMin?: number; // move
		grabOffsetMin?: number; // move: where in the block the user grabbed
		origStartMin?: number; // resize: fixed start
	};

	let drag = $state<DragState | null>(null);
	let justDragged = false; // suppress the click that follows a moved event drag

	let popover = $state<{ x: number; y: number; start: Date; end: Date } | null>(null);

	function addDragListeners() {
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
	}
	function removeDragListeners() {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
	}

	$effect(() => () => removeDragListeners());

	function onColumnPointerDown(e: PointerEvent, colIndex: number) {
		if (!canCreate || e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('a') || target.closest('[data-resize]')) return;
		e.preventDefault();
		const startMin = snapMin(clampDayMin(minFromClientY(e.clientY)));
		drag = {
			mode: 'create',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			anchorMin: startMin,
			ghostStartMin: startMin,
			ghostEndMin: startMin + DEFAULT_DURATION_MIN
		};
		addDragListeners();
	}

	function onEventPointerDown(e: PointerEvent, ev: LaidOut, colIndex: number) {
		if (!canReschedule || e.button !== 0) return;
		// Don't start a move from the resize handle.
		if ((e.target as HTMLElement).closest('[data-resize]')) return;
		e.stopPropagation();
		drag = {
			mode: 'move',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			item: ev.item,
			durationMin: ev.endMin - ev.startMin,
			grabOffsetMin: minFromClientY(e.clientY) - ev.startMin,
			ghostStartMin: ev.startMin,
			ghostEndMin: ev.endMin
		};
		addDragListeners();
	}

	function onResizePointerDown(e: PointerEvent, ev: LaidOut, colIndex: number) {
		if (!canReschedule || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		drag = {
			mode: 'resize',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			item: ev.item,
			origStartMin: ev.startMin,
			ghostStartMin: ev.startMin,
			ghostEndMin: ev.endMin
		};
		addDragListeners();
	}

	function onPointerMove(e: PointerEvent) {
		const d = drag;
		if (!d) return;
		if (!d.moved) {
			if (Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_THRESHOLD)
				return;
			d.moved = true;
		}

		if (d.mode === 'create') {
			const cur = snapMin(clampDayMin(minFromClientY(e.clientY)));
			const anchor = d.anchorMin ?? cur;
			d.ghostStartMin = Math.min(anchor, cur);
			d.ghostEndMin = Math.max(anchor, cur);
			if (d.ghostEndMin - d.ghostStartMin < SNAP_MINUTES) d.ghostEndMin = d.ghostStartMin + SNAP_MINUTES;
		} else if (d.mode === 'move') {
			const col = colFromPoint(e.clientX, e.clientY);
			if (col >= 0) d.colIndex = col;
			const dur = d.durationMin ?? DEFAULT_DURATION_MIN;
			let start = snapMin(minFromClientY(e.clientY) - (d.grabOffsetMin ?? 0));
			start = Math.max(0, Math.min(24 * 60 - dur, start));
			d.ghostStartMin = start;
			d.ghostEndMin = start + dur;
		} else {
			const origStart = d.origStartMin ?? 0;
			let end = snapMin(clampDayMin(minFromClientY(e.clientY)));
			if (end < origStart + SNAP_MINUTES) end = origStart + SNAP_MINUTES;
			d.ghostEndMin = end;
		}
	}

	function onPointerUp(e: PointerEvent) {
		const d = drag;
		drag = null;
		removeDragListeners();
		if (!d) return;

		if (d.mode === 'create') {
			const date = days[d.colIndex]?.date;
			if (!date) return;
			const startMin = d.ghostStartMin;
			const endMin = d.moved ? d.ghostEndMin : startMin + DEFAULT_DURATION_MIN;
			// Browser-local wall-clock — the /new form reinterprets it via its picker
			// (matches the previous click-to-create behaviour exactly).
			const start = new Date(date);
			start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
			const end = new Date(date);
			end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
			popover = { x: e.clientX, y: e.clientY, start, end };
			return;
		}

		// move / resize — only commit if the pointer actually moved.
		if (!d.moved || !d.item) return;
		justDragged = true;
		setTimeout(() => (justDragged = false), 0);
		void commitReschedule(d);
	}

	async function commitReschedule(d: DragState) {
		const item = d.item;
		if (!item) return;
		const date = days[d.colIndex]?.date;
		if (!date) return;

		const startIso = wallClockToUtc(date, d.ghostStartMin, orgTz).toISOString();
		const endIso = wallClockToUtc(date, d.ghostEndMin, orgTz).toISOString();
		if (startIso === item.scheduled_start && endIso === (item.scheduled_end ?? '')) return;

		const prev = appointmentsStore.optimisticUpdate(item.id, {
			scheduled_start: startIso,
			scheduled_end: endIso
		});

		try {
			const res = await fetch(`/api/appointments/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scheduled_start: startIso, scheduled_end: endIso })
			});
			if (!res.ok) {
				if (prev) appointmentsStore.optimisticUpdate(item.id, prev);
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(
					res.status === 409 ? 'Time conflict with another appointment.' : body.error ?? 'Could not reschedule.'
				);
				return;
			}
			const body = (await res.json()) as { data: AppointmentDetail };
			appointmentsStore.setDetail(body.data);
			toast.success('Appointment rescheduled.');
		} catch {
			if (prev) appointmentsStore.optimisticUpdate(item.id, prev);
			toast.error('Could not reschedule.');
		}
	}

	function statusClasses(s: AppointmentListItem['status']): string {
		if (s === 'cancelled' || s === 'no_show')
			return 'bg-destructive/15 text-destructive border-destructive/30 line-through';
		if (s === 'completed')
			return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300';
		return 'bg-primary/15 text-foreground border-primary/30';
	}
</script>

<div class="relative flex h-full flex-col overflow-y-auto bg-card">
	<!-- Day headers — sticky so they stay visible while the grid body scrolls -->
	<div
		class="sticky top-0 z-10 grid shrink-0 border-b border-border bg-background/95 backdrop-blur"
		style="grid-template-columns: 64px repeat(7, 1fr);"
	>
		<div class="border-r border-border bg-muted/30"></div>
		{#each days as day (day.key)}
			{@const today_ = isSameDay(day.date, today)}
			<div
				class={cn(
					'flex flex-col items-center justify-center gap-0.5 border-r border-border py-2 text-center last:border-r-0',
					today_ ? 'bg-primary/5' : ''
				)}
			>
				<span
					class={cn(
						'text-[11px] font-semibold uppercase tracking-wide',
						today_ ? 'text-primary' : 'text-muted-foreground'
					)}
				>
					{weekdayFmt.format(day.date)}
				</span>
				<span
					class={cn('text-lg font-bold tabular-nums', today_ ? 'text-primary' : 'text-foreground')}
				>
					{day.date.getDate()}
				</span>
			</div>
		{/each}
	</div>

	<!-- Body: time rail + 7 day columns -->
	<div
		bind:this={gridBodyEl}
		class="relative grid flex-1"
		style="grid-template-columns: 64px repeat(7, 1fr); min-height: {range.hours * HOUR_HEIGHT +
			TOP_GUTTER}px;"
	>
		<!-- Time rail -->
		<div class="relative border-r border-border bg-muted/20">
			{#each hourLabels as h (h.hour)}
				<div
					class={cn(
						'absolute right-1 -translate-y-1/2 text-[10px] font-medium tabular-nums',
						h.isOffHours ? 'text-muted-foreground/50' : 'text-muted-foreground'
					)}
					style="top: {pxFromMin(h.hour * 60)}px;"
				>
					{h.label}
				</div>
			{/each}
		</div>

		<!-- Day columns -->
		{#each days as day, i (day.key)}
			{@const today_ = isSameDay(day.date, today)}
			<button
				type="button"
				data-col-index={i}
				onpointerdown={(e) => onColumnPointerDown(e, i)}
				class={cn(
					'relative touch-none border-r border-border text-left last:border-r-0 focus:outline-none',
					drag ? 'cursor-grabbing' : canCreate ? 'cursor-copy' : 'cursor-default',
					today_ ? 'bg-primary/[0.03]' : ''
				)}
				aria-label={canCreate ? `New appointment on ${day.date.toDateString()}` : undefined}
			>
				<!-- Hour grid lines & off-hours shading -->
				{#each hourLabels as h (h.hour)}
					<div
						class={cn(
							'absolute inset-x-0 border-t border-border/60',
							h.isOffHours ? 'bg-muted/30' : ''
						)}
						style="top: {pxFromMin(h.hour * 60)}px; height: {HOUR_HEIGHT}px;"
					></div>
					<!-- half-hour subline -->
					<div
						class="absolute inset-x-0 border-t border-dashed border-border/30"
						style="top: {pxFromMin(h.hour * 60 + 30)}px;"
					></div>
				{/each}

				<!-- Now-line: only on today's column -->
				{#if today_ && nowVisible}
					<div
						class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
						style="top: {pxFromMin(nowMin)}px;"
					>
						<span class="-ml-1 h-2 w-2 rounded-full bg-rose-500 shadow-sm"></span>
						<span class="h-px flex-1 bg-rose-500"></span>
					</div>
				{/if}

				<!-- Event blocks -->
				{#each day.laidOut as ev (ev.item.id)}
					{@const top = pxFromMin(ev.startMin)}
					{@const height = Math.max(20, pxFromMin(ev.endMin) - top)}
					{@const widthPct = 100 / ev.cols}
					{@const leftPct = ev.col * widthPct}
					{@const dragging = drag?.mode === 'move' && drag.item?.id === ev.item.id}
					<a
						href={`/appointments/${ev.item.id}`}
						use:prefetchOnIntent={() => appointmentsStore.prefetchDetail(ev.item.id)}
						onpointerdown={(e) => onEventPointerDown(e, ev, i)}
						onclick={(e) => {
							e.stopPropagation();
							if (justDragged) e.preventDefault();
						}}
						class={cn(
							'group absolute z-10 select-none overflow-hidden rounded-md border px-1.5 py-1 text-[11px] leading-tight shadow-sm transition-shadow hover:z-30 hover:shadow-md',
							canReschedule ? 'cursor-grab touch-none' : '',
							dragging ? 'opacity-40' : '',
							statusClasses(ev.item.status)
						)}
						style="top: {top}px; height: {height}px; left: calc({leftPct}% + 2px); width: calc({widthPct}% - 4px);"
					>
						<p class="truncate font-semibold">
							{formatTimeInOrgTz(ev.item.scheduled_start, orgTz)}
						</p>
						<p class="truncate">{ev.item.title}</p>
						{#if height >= 48}
							<p class="truncate opacity-80">{ev.item.contact_name}</p>
						{/if}
						{#if canReschedule}
							<!-- Resize handle (bottom edge) -->
							<span
								data-resize
								role="slider"
								tabindex="-1"
								aria-label="Resize appointment end time"
								aria-valuenow={ev.endMin}
								onpointerdown={(e) => onResizePointerDown(e, ev, i)}
								class="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
							></span>
						{/if}
					</a>
				{/each}

				<!-- Drag ghost -->
				{#if drag && drag.colIndex === i && (drag.moved || drag.mode === 'resize')}
					{@const gTop = pxFromMin(drag.ghostStartMin)}
					{@const gHeight = Math.max(20, pxFromMin(drag.ghostEndMin) - gTop)}
					<div
						class="pointer-events-none absolute inset-x-0.5 z-40 flex flex-col rounded-md border-2 border-dashed border-primary bg-primary/20 px-1.5 py-1"
						style="top: {gTop}px; height: {gHeight}px;"
					>
						<span class="truncate text-[11px] font-semibold tabular-nums text-primary">
							{labelForMin(drag.ghostStartMin)} – {labelForMin(drag.ghostEndMin)}
						</span>
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>

{#if popover}
	<QuickCreatePopover
		x={popover.x}
		y={popover.y}
		start={popover.start}
		end={popover.end}
		onClose={() => (popover = null)}
	/>
{/if}
