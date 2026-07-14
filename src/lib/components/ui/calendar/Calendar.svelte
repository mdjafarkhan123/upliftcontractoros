<script lang="ts">
	import { untrack } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';

	let {
		value = $bindable(''),
		placeholder = 'Pick a date',
		disabled = false,
		min = '',
		class: className,
		onValueChange
	}: {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		min?: string;
		class?: string;
		// Fired after the value changes (pick or clear). Useful when the caller keeps the
		// date in a composed field and can't use `bind:value` (e.g. date + separate time).
		onValueChange?: (value: string) => void;
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
		onValueChange?.(dateStr);
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
				class="cal-pick__trigger {className ?? ''}"
				class:cal-pick__trigger--empty={!value}
			>
				<i class="ri-calendar-line" aria-hidden="true"></i>
				<span>{displayLabel || placeholder}</span>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content
		align="start"
		side="bottom"
		sideOffset={8}
		collisionPadding={12}
		class="cal-pick__popover"
	>
		<div class="cal-pick">
			<!-- Month navigation -->
			<div class="cal-pick__nav">
				<button
					type="button"
					class="cal-pick__nav-btn"
					onclick={prevMonth}
					aria-label="Previous month"
				>
					<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
				</button>
				<span class="cal-pick__month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
				<button type="button" class="cal-pick__nav-btn" onclick={nextMonth} aria-label="Next month">
					<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
				</button>
			</div>

			<!-- Day-of-week headers -->
			<div class="cal-pick__day-headers">
				{#each DAY_HEADERS as hdr}
					<div class="cal-pick__day-hdr">{hdr}</div>
				{/each}
			</div>

			<!-- Days grid -->
			<div class="cal-pick__days">
				{#each calendarDays as cell (cell.dateStr)}
					{@const isSelected = cell.dateStr === value}
					{@const isToday = cell.dateStr === todayStr}
					<button
						type="button"
						onclick={() => pickDate(cell.dateStr)}
						disabled={cell.disabled}
						class="cal-pick__day"
						class:cal-pick__day--muted={cell.disabled}
						class:cal-pick__day--today={isToday && !isSelected}
						class:cal-pick__day--selected={isSelected}
					>
						{cell.day}
						{#if isToday && !isSelected}
							<span class="cal-pick__today-dot"></span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Clear button -->
			{#if value}
				<button
					type="button"
					class="cal-pick__clear"
					onclick={() => {
						value = '';
						onValueChange?.('');
						open = false;
					}}
				>
					Clear date
				</button>
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
