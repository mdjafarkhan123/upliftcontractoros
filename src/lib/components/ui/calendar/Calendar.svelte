<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils/cn';

	let {
		value = $bindable(''),
		placeholder = 'Pick a date',
		disabled = false,
		min = '',
		class: className
	}: {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		min?: string;
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

	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());

	$effect(() => {
		if (open) {
			const dateStr = untrack(() => value);
			if (dateStr) {
				const d = new Date(dateStr + 'T00:00');
				if (!isNaN(d.getTime())) {
					viewYear = d.getFullYear();
					viewMonth = d.getMonth();
				}
			}
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

		const cells: { day: number; dateStr: string; current: boolean; disabled: boolean }[] = [];

		for (let i = dow - 1; i >= 0; i--) {
			const d = daysInPrevMonth - i;
			const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			cells.push({ day: d, dateStr, current: false, disabled: true });
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const isDisabled = min ? dateStr < min : false;
			cells.push({ day: d, dateStr, current: true, disabled: isDisabled });
		}

		let nd = 1;
		while (cells.length < 42) {
			const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
			cells.push({ day: nd, dateStr, current: false, disabled: true });
			nd++;
		}

		return cells;
	});

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
		value = dateStr;
		open = false;
	}

	let displayLabel = $derived.by(() => {
		if (!value) return '';
		const d = new Date(value + 'T00:00');
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
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
				<CalendarIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
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
					{@const isSelected = cell.dateStr === value}
					{@const isToday = cell.dateStr === todayStr}
					<button
						type="button"
						onclick={() => pickDate(cell.dateStr)}
						disabled={cell.disabled}
						class={cn(
							'relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all duration-150',
							cell.disabled && 'pointer-events-none text-muted-foreground/25',
							!cell.disabled && !isSelected && 'text-foreground hover:bg-muted',
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

			<!-- Clear button -->
			{#if value}
				<button
					type="button"
					onclick={() => {
						value = '';
						open = false;
					}}
					class="mt-2 flex h-8 w-full items-center justify-center rounded-md text-xs text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
				>
					Clear date
				</button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
