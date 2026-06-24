<script lang="ts">
	import { addDays, dayKey, isSameDay, startOfWeekMonday } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { cn } from '$lib/utils/cn';
	import type { AppointmentListItem } from '$lib/types/appointments';

	let {
		anchor,
		items,
		onDayClick
	}: {
		anchor: Date; // start of the displayed month
		items: AppointmentListItem[];
		onDayClick: (d: Date) => void;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	const MAX_VISIBLE = 3; // event pills shown per cell before "+N more"
	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const today = new Date();

	// Resolve an appointment to its calendar day in the org's timezone so an event
	// at 11pm org-time lands on the correct cell regardless of the viewer's browser tz.
	function tzDateKey(d: Date, tz: string | undefined): string {
		try {
			return new Intl.DateTimeFormat('en-CA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				timeZone: tz || undefined
			}).format(d);
		} catch {
			return dayKey(d);
		}
	}

	const eventsByDay = $derived.by(() => {
		const map = new Map<string, AppointmentListItem[]>();
		for (const item of items) {
			const key = tzDateKey(new Date(item.scheduled_start), orgTz);
			const arr = map.get(key);
			if (arr) arr.push(item);
			else map.set(key, [item]);
		}
		for (const arr of map.values()) {
			arr.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
		}
		return map;
	});

	// 6 weeks × 7 days, Monday-aligned, covering the whole month plus spill days.
	const cells = $derived.by(() => {
		const gridStart = startOfWeekMonday(anchor);
		const month = anchor.getMonth();
		const out: { date: Date; key: string; inMonth: boolean }[] = [];
		for (let i = 0; i < 42; i++) {
			const date = addDays(gridStart, i);
			out.push({ date, key: dayKey(date), inMonth: date.getMonth() === month });
		}
		return out;
	});

	function pillClasses(s: AppointmentListItem['status']): string {
		if (s === 'cancelled' || s === 'no_show')
			return 'bg-destructive/15 text-destructive line-through';
		if (s === 'completed') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
		return 'bg-primary/15 text-foreground';
	}
</script>

<div class="flex h-full flex-col bg-card">
	<!-- Weekday header row -->
	<div class="grid shrink-0 grid-cols-7 border-b border-border bg-background/95">
		{#each WEEKDAYS as wd (wd)}
			<div
				class="border-r border-border py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
			>
				{wd}
			</div>
		{/each}
	</div>

	<!-- 6-week grid -->
	<div class="grid flex-1 grid-cols-7 grid-rows-6">
		{#each cells as cell (cell.key)}
			{@const dayItems = eventsByDay.get(cell.key) ?? []}
			{@const isToday = isSameDay(cell.date, today)}
			{@const overflow = dayItems.length - MAX_VISIBLE}
			<div
				class={cn(
					'flex min-h-0 flex-col gap-0.5 border-b border-r border-border p-1 last:border-r-0',
					!cell.inMonth && 'bg-muted/20'
				)}
			>
				<!-- Date number -->
				<button
					type="button"
					onclick={() => onDayClick(cell.date)}
					class={cn(
						'mb-0.5 flex h-5 w-5 shrink-0 items-center justify-center self-end rounded-full text-[11px] font-medium tabular-nums transition-colors',
						isToday
							? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
							: cell.inMonth
								? 'text-foreground hover:bg-muted'
								: 'text-muted-foreground/50 hover:bg-muted'
					)}
					aria-label={`View ${cell.date.toDateString()}`}
				>
					{cell.date.getDate()}
				</button>

				<!-- Event pills -->
				<div class="flex min-h-0 flex-col gap-0.5 overflow-hidden">
					{#each dayItems.slice(0, MAX_VISIBLE) as ev (ev.id)}
						<a
							href={`/appointments/${ev.id}`}
							use:prefetchOnIntent={() => appointmentsStore.prefetchDetail(ev.id)}
							class={cn(
								'flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight transition-opacity hover:opacity-80',
								pillClasses(ev.status)
							)}
						>
							<span class="shrink-0 font-medium tabular-nums opacity-80">
								{formatTimeInOrgTz(ev.scheduled_start, orgTz)}
							</span>
							<span class="truncate">{ev.title}</span>
						</a>
					{/each}
					{#if overflow > 0}
						<button
							type="button"
							onclick={() => onDayClick(cell.date)}
							class="px-1 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
						>
							+{overflow} more
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
