<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Calendar, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils/cn';

	let {
		value = $bindable(''),
		placeholder = 'Select date & time',
		disabled = false,
		class: className
	}: {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
	} = $props();

	const MONTH_NAMES = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

	const today = new Date();
	const todayStr = fmtDateStr(today);

	function fmtDateStr(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	let open = $state(false);
	let timeListEl = $state<HTMLDivElement | null>(null);

	let selectedDateStr = $derived(value ? value.split('T')[0] : '');
	let selectedTimeStr = $derived(
		value && value.includes('T') ? value.split('T')[1].slice(0, 5) : ''
	);

	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());

	$effect(() => {
		if (open) {
			const dateStr = untrack(() => selectedDateStr);
			if (dateStr) {
				const d = new Date(dateStr + 'T00:00');
				viewYear = d.getFullYear();
				viewMonth = d.getMonth();
			}
			tick().then(() => {
				if (!timeListEl) return;
				const timeStr = untrack(() => selectedTimeStr);
				const targetTime = timeStr || '08:00';
				const el = timeListEl.querySelector<HTMLElement>(`[data-time="${targetTime}"]`);
				if (!el) return;
				// Scroll only the time-list container — avoid scrollIntoView,
				// which also scrolls ancestor/window and causes the page to jump.
				const center = timeStr
					? el.offsetTop - timeListEl.clientHeight / 2 + el.clientHeight / 2
					: el.offsetTop;
				timeListEl.scrollTop = Math.max(0, center);
			});
		}
	});

	let calendarDays = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1);
		let dow = firstDay.getDay();
		dow = dow === 0 ? 6 : dow - 1; // Mon=0 … Sun=6

		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
		const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
		const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
		const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
		const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

		const cells: { day: number; dateStr: string; current: boolean }[] = [];

		for (let i = dow - 1; i >= 0; i--) {
			const d = daysInPrevMonth - i;
			cells.push({
				day: d,
				dateStr: `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
				current: false
			});
		}

		for (let d = 1; d <= daysInMonth; d++) {
			cells.push({
				day: d,
				dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
				current: true
			});
		}

		let nd = 1;
		while (cells.length < 42) {
			cells.push({
				day: nd,
				dateStr: `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`,
				current: false
			});
			nd++;
		}

		return cells;
	});

	const TIME_SLOTS: { value: string; label: string }[] = (() => {
		const slots: { value: string; label: string }[] = [];
		for (let h = 0; h < 24; h++) {
			for (const m of [0, 30]) {
				const hh = String(h).padStart(2, '0');
				const mm = String(m).padStart(2, '0');
				const period = h < 12 ? 'AM' : 'PM';
				const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
				slots.push({ value: `${hh}:${mm}`, label: `${dh}:${mm} ${period}` });
			}
		}
		return slots;
	})();

	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear--;
		} else {
			viewMonth--;
		}
	}

	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear++;
		} else {
			viewMonth++;
		}
	}

	function pickDate(dateStr: string) {
		const time = untrack(() => selectedTimeStr) || '09:00';
		value = `${dateStr}T${time}`;
	}

	function pickTime(timeVal: string) {
		const date = untrack(() => selectedDateStr) || todayStr;
		value = `${date}T${timeVal}`;
		open = false;
	}

	let displayLabel = $derived.by(() => {
		if (!value) return '';
		// datetime-local format: "YYYY-MM-DDTHH:mm"
		const [datePart, timePart] = value.split('T');
		if (!datePart) return '';
		const d = new Date(datePart + 'T' + (timePart ?? '00:00'));
		if (isNaN(d.getTime())) return '';
		const dateLabel = d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		const timeLabel = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return `${dateLabel} · ${timeLabel}`;
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				{disabled}
				class={cn(
					'flex h-11 w-full items-center gap-2.5 rounded-md border border-input bg-background px-3 text-sm transition-all duration-150',
					'hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					disabled && 'cursor-not-allowed opacity-50',
					!value && 'text-muted-foreground',
					className
				)}
			>
				<Calendar class="h-4 w-4 shrink-0 text-muted-foreground" />
				<span class="flex-1 text-left">{displayLabel || placeholder}</span>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content
		align="start"
		side="bottom"
		sideOffset={8}
		collisionPadding={12}
		class="w-auto max-w-[calc(100vw-32px)] overflow-hidden p-0 shadow-[var(--shadow-dropdown)]"
	>
		<div
			class="flex flex-col sm:flex-row sm:h-[326px] divide-y sm:divide-y-0 sm:divide-x divide-border/50"
		>
			<!-- Calendar panel -->
			<div class="flex flex-col p-4">
				<!-- Month navigation -->
				<div class="mb-3 flex items-center justify-between gap-2">
					<button
						type="button"
						onclick={prevMonth}
						class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
					>
						<ChevronLeft class="h-3.5 w-3.5" />
					</button>
					<span class="min-w-[138px] text-center text-sm font-semibold text-foreground">
						{MONTH_NAMES[viewMonth]}
						{viewYear}
					</span>
					<button
						type="button"
						onclick={nextMonth}
						class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
					>
						<ChevronRight class="h-3.5 w-3.5" />
					</button>
				</div>

				<!-- Day-of-week headers -->
				<div class="mb-1 grid grid-cols-7">
					{#each DAY_HEADERS as hdr}
						<div
							class="flex h-8 w-9 items-center justify-center text-[11px] font-medium tracking-wide text-muted-foreground"
						>
							{hdr}
						</div>
					{/each}
				</div>

				<!-- Days grid -->
				<div class="grid grid-cols-7">
					{#each calendarDays as cell (cell.dateStr)}
						{@const isSelected = cell.dateStr === selectedDateStr}
						{@const isToday = cell.dateStr === todayStr}
						<button
							type="button"
							onclick={() => pickDate(cell.dateStr)}
							disabled={!cell.current}
							class={cn(
								'relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all duration-150',
								!cell.current && 'pointer-events-none text-muted-foreground/25',
								cell.current && !isSelected && 'text-foreground hover:bg-muted',
								isSelected && 'bg-primary text-primary-foreground font-medium hover:bg-primary/90',
								isToday && !isSelected && 'font-semibold'
							)}
						>
							{cell.day}
							{#if isToday && !isSelected}
								<span
									class="absolute bottom-[3px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-primary"
								></span>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- Time slots panel -->
			<div
				bind:this={timeListEl}
				class="flex w-full sm:w-[116px] flex-col overflow-y-auto py-2 max-h-[220px] sm:max-h-none [scrollbar-width:thin]"
			>
				{#each TIME_SLOTS as slot}
					{@const isSelected = slot.value === selectedTimeStr}
					<button
						type="button"
						data-time={slot.value}
						onclick={() => pickTime(slot.value)}
						class={cn(
							'flex h-9 w-full shrink-0 items-center px-4 text-sm transition-all duration-150',
							isSelected
								? 'bg-muted font-semibold text-foreground'
								: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
						)}
					>
						{slot.label}
					</button>
				{/each}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
