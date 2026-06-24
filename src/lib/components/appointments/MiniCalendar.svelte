<script lang="ts">
	import { untrack } from 'svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import { addDays, dayKey, startOfWeekMonday } from '$lib/utils/calendar';

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

	let {
		anchor,
		onDateSelect
	}: {
		anchor: Date;
		onDateSelect: (d: Date) => void;
	} = $props();

	const today = new Date();
	const todayKey = dayKey(today);

	let viewYear = $state(untrack(() => anchor.getFullYear()));
	let viewMonth = $state(untrack(() => anchor.getMonth()));

	// Follow the main calendar when it navigates, but only if the anchor moves to a different month
	$effect(() => {
		const ay = anchor.getFullYear();
		const am = anchor.getMonth();
		if (ay !== viewYear || am !== viewMonth) {
			viewYear = ay;
			viewMonth = am;
		}
	});

	function prevMonth() {
		if (viewMonth === 0) { viewMonth = 11; viewYear--; }
		else viewMonth--;
	}

	function nextMonth() {
		if (viewMonth === 11) { viewMonth = 0; viewYear++; }
		else viewMonth++;
	}

	// Week keys for the anchor week (Mo–Su) for highlighting
	const anchorWeekKeys = $derived.by(() => {
		const monday = startOfWeekMonday(anchor);
		const keys = new Set<string>();
		for (let i = 0; i < 7; i++) keys.add(dayKey(addDays(monday, i)));
		return keys;
	});

	function fmtKey(y: number, m: number, d: number): string {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	const calendarDays = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1);
		let dow = firstDay.getDay();
		dow = dow === 0 ? 6 : dow - 1; // Mon=0

		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
		const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
		const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
		const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
		const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

		const cells: { day: number; key: string; current: boolean }[] = [];

		for (let i = dow - 1; i >= 0; i--) {
			const d = daysInPrevMonth - i;
			cells.push({ day: d, key: fmtKey(prevY, prevM, d), current: false });
		}
		for (let d = 1; d <= daysInMonth; d++) {
			cells.push({ day: d, key: fmtKey(viewYear, viewMonth, d), current: true });
		}
		let nd = 1;
		while (cells.length < 42) {
			cells.push({ day: nd, key: fmtKey(nextY, nextM, nd), current: false });
			nd++;
		}
		return cells;
	});

	function handleDayClick(cell: { key: string; current: boolean }) {
		// Parse key back to a Date (YYYY-MM-DD, local time)
		const [y, m, d] = cell.key.split('-').map(Number);
		onDateSelect(new Date(y, m - 1, d));
	}
</script>

<div class="select-none px-3 py-3">
	<!-- Month navigation -->
	<div class="mb-2 flex items-center justify-between">
		<button
			type="button"
			onclick={prevMonth}
			class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<ChevronLeft class="h-3 w-3" />
		</button>
		<span class="text-xs font-semibold text-foreground">
			{MONTH_NAMES[viewMonth]} {viewYear}
		</span>
		<button
			type="button"
			onclick={nextMonth}
			class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<ChevronRight class="h-3 w-3" />
		</button>
	</div>

	<!-- Day-of-week headers -->
	<div class="mb-0.5 grid grid-cols-7">
		{#each DAY_HEADERS as hdr}
			<div class="flex h-6 items-center justify-center text-[10px] font-medium text-muted-foreground">
				{hdr}
			</div>
		{/each}
	</div>

	<!-- Day cells — 6 rows × 7 cols -->
	<div class="grid grid-cols-7">
		{#each calendarDays as cell (cell.key)}
			{@const isToday = cell.key === todayKey}
			{@const inAnchorWeek = anchorWeekKeys.has(cell.key)}
			<button
				type="button"
				onclick={() => handleDayClick(cell)}
				class={cn(
					'relative flex h-7 w-full items-center justify-center rounded-full text-[11px] transition-colors',
					!cell.current && 'text-muted-foreground/40',
					cell.current && !isToday && !inAnchorWeek && 'text-foreground hover:bg-muted',
					inAnchorWeek && !isToday && 'bg-primary/10 text-primary rounded-none hover:bg-primary/20',
					// Round the left/right edges of the week band
					inAnchorWeek && cell.key === [...anchorWeekKeys][0] && 'rounded-l-full',
					inAnchorWeek && cell.key === [...anchorWeekKeys][6] && 'rounded-r-full',
					isToday && 'bg-primary text-primary-foreground font-semibold hover:bg-primary/90 rounded-full z-10'
				)}
			>
				{cell.day}
			</button>
		{/each}
	</div>
</div>
