<script lang="ts">
	import { tick, untrack } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';

	let {
		value = $bindable(''),
		placeholder = 'Select date & time',
		disabled = false,
		min = ''
	}: {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		// Earliest selectable date/time as a local `YYYY-MM-DDTHH:mm` string. Days before the
		// min date are disabled; on the min date itself, time slots before the min time are too.
		// Empty string = no lower bound. Used to keep an end never earlier than its start.
		min?: string;
	} = $props();

	let minDateStr = $derived(min ? min.split('T')[0] : '');
	let minTimeStr = $derived(min && min.includes('T') ? min.split('T')[1].slice(0, 5) : '');

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
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
				const center = timeStr
					? el.offsetTop - timeListEl!.clientHeight / 2 + el.clientHeight / 2
					: el.offsetTop;
				timeListEl!.scrollTop = Math.max(0, center);
			});
		}
	});

	let calendarDays = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1);
		let dow = firstDay.getDay();
		dow = dow === 0 ? 6 : dow - 1;

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
		if (viewMonth === 0) { viewMonth = 11; viewYear--; }
		else { viewMonth--; }
	}

	function nextMonth() {
		if (viewMonth === 11) { viewMonth = 0; viewYear++; }
		else { viewMonth++; }
	}

	function pickDate(dateStr: string) {
		let time = untrack(() => selectedTimeStr) || '09:00';
		// Keep the composed value at or after `min`: if landing on the min date with an
		// earlier time carried over, snap the time up to the min time.
		if (minDateStr && dateStr === minDateStr && minTimeStr && time < minTimeStr) {
			time = minTimeStr;
		}
		value = `${dateStr}T${time}`;
	}

	function pickTime(timeVal: string) {
		const date = untrack(() => selectedDateStr) || todayStr;
		value = `${date}T${timeVal}`;
		open = false;
	}

	let displayLabel = $derived.by(() => {
		if (!value) return '';
		const [datePart, timePart] = value.split('T');
		if (!datePart) return '';
		const d = new Date(datePart + 'T' + (timePart ?? '00:00'));
		if (isNaN(d.getTime())) return '';
		const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
				class="dtp__trigger"
				class:dtp__trigger--empty={!value}
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
		class="dtp__popover"
	>
		<div class="dtp__panels">
			<!-- Calendar panel -->
			<div class="dtp__cal">
				<div class="dtp__nav">
					<button type="button" class="dtp__nav-btn" onclick={prevMonth} aria-label="Previous month">
						<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
					</button>
					<span class="dtp__month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
					<button type="button" class="dtp__nav-btn" onclick={nextMonth} aria-label="Next month">
						<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
					</button>
				</div>

				<div class="dtp__day-headers">
					{#each DAY_HEADERS as hdr}
						<div class="dtp__day-hdr">{hdr}</div>
					{/each}
				</div>

				<div class="dtp__days">
					{#each calendarDays as cell (cell.dateStr)}
						{@const isSelected = cell.dateStr === selectedDateStr}
						{@const isToday = cell.dateStr === todayStr}
						{@const belowMin = !!minDateStr && cell.dateStr < minDateStr}
						<button
							type="button"
							onclick={() => pickDate(cell.dateStr)}
							disabled={!cell.current || belowMin}
							class="dtp__day"
							class:dtp__day--out={!cell.current}
							class:dtp__day--disabled={cell.current && belowMin}
							class:dtp__day--today={isToday && !isSelected}
							class:dtp__day--selected={isSelected}
						>
							{cell.day}
							{#if isToday && !isSelected}
								<span class="dtp__today-dot"></span>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="dtp__divider" aria-hidden="true"></div>

			<!-- Time slots panel -->
			<div class="dtp__times" bind:this={timeListEl}>
				{#each TIME_SLOTS as slot}
					{@const isSelected = slot.value === selectedTimeStr}
					{@const belowMin =
						!!minDateStr && selectedDateStr === minDateStr && !!minTimeStr && slot.value < minTimeStr}
					<button
						type="button"
						data-time={slot.value}
						onclick={() => pickTime(slot.value)}
						disabled={belowMin}
						class="dtp__time"
						class:dtp__time--selected={isSelected}
					>
						{slot.label}
					</button>
				{/each}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
