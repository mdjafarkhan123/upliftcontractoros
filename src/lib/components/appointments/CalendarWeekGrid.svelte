<script lang="ts">
	import { addDays, dayKey, isSameDay } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { cn } from '$lib/utils/cn';
	import type { AppointmentListItem } from '$lib/types/appointments';

	let {
		anchor,
		items,
		dayStartHour,
		dayEndHour,
		canCreate
	}: {
		anchor: Date;
		items: AppointmentListItem[];
		dayStartHour: number;
		dayEndHour: number;
		canCreate: boolean;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	const HOUR_HEIGHT = 56; // px
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
		return ((min - range.startMin) / 60) * HOUR_HEIGHT;
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

	function handleColumnClick(e: MouseEvent, date: Date) {
		if (!canCreate) return;
		// Ignore clicks that landed on an event link (let the link handle it).
		const target = e.target as HTMLElement;
		if (target.closest('a')) return;
		const column = e.currentTarget as HTMLElement;
		const rect = column.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const minutesFromStart = Math.max(0, (y / HOUR_HEIGHT) * 60);
		const rawMin = range.startMin + minutesFromStart;
		const snapped = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
		const hour = Math.floor(snapped / 60);
		const minute = snapped % 60;
		// Build a Date in the local browser tz that matches the visual slot.
		// We're picking wall-clock time on the clicked day; the form will
		// reinterpret it via its DateTimePicker.
		const start = new Date(date);
		start.setHours(hour, minute, 0, 0);
		const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
		const params = new URLSearchParams({
			start: start.toISOString(),
			end: end.toISOString()
		});
		window.location.href = `/appointments/new?${params.toString()}`;
	}

	function statusClasses(s: AppointmentListItem['status']): string {
		if (s === 'cancelled' || s === 'no_show')
			return 'bg-destructive/15 text-destructive border-destructive/30 line-through';
		if (s === 'completed')
			return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300';
		return 'bg-primary/15 text-foreground border-primary/30';
	}
</script>

<div class="overflow-hidden rounded-xl border border-border bg-card shadow-card">
	<!-- Day headers (sticky-ish; consumer page already scrolls). -->
	<div class="grid border-b border-border" style="grid-template-columns: 64px repeat(7, 1fr);">
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
		class="relative grid"
		style="grid-template-columns: 64px repeat(7, 1fr); height: {range.hours * HOUR_HEIGHT}px;"
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
		{#each days as day (day.key)}
			{@const today_ = isSameDay(day.date, today)}
			<button
				type="button"
				onclick={(e) => handleColumnClick(e, day.date)}
				class={cn(
					'relative border-r border-border text-left last:border-r-0 focus:outline-none',
					canCreate ? 'cursor-copy' : 'cursor-default',
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
					<a
						href={`/appointments/${ev.item.id}`}
						onclick={(e) => e.stopPropagation()}
						class={cn(
							'absolute z-10 overflow-hidden rounded-md border px-1.5 py-1 text-[11px] leading-tight shadow-sm transition-all hover:z-30 hover:shadow-md',
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
					</a>
				{/each}
			</button>
		{/each}
	</div>
</div>
