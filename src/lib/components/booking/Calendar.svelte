<script lang="ts">
	type Props = {
		month: string; // YYYY-MM
		availableDates: Set<string>; // YYYY-MM-DD
		loading?: boolean;
		selectedDate?: string | null;
		timezone: string;
		minMonth?: string; // YYYY-MM — earliest navigable month
		maxMonth?: string; // YYYY-MM — latest navigable month
		onSelectDate: (date: string) => void;
		onChangeMonth: (month: string) => void;
	};

	let {
		month,
		availableDates,
		loading = false,
		selectedDate = null,
		timezone,
		minMonth,
		maxMonth,
		onSelectDate,
		onChangeMonth
	}: Props = $props();

	const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function parseMonth(m: string): { year: number; monthIndex: number } {
		const [y, mm] = m.split('-').map(Number);
		return { year: y, monthIndex: mm - 1 };
	}

	function formatMonth(year: number, monthIndex: number): string {
		return `${year.toString().padStart(4, '0')}-${(monthIndex + 1).toString().padStart(2, '0')}`;
	}

	function isoDate(year: number, monthIndex: number, day: number): string {
		return `${year.toString().padStart(4, '0')}-${(monthIndex + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
	}

	const parsed = $derived(parseMonth(month));
	const monthLabel = $derived(
		new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).toLocaleDateString('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		})
	);

	const todayIso = $derived(
		(() => {
			const fmt = new Intl.DateTimeFormat('en-CA', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			});
			return fmt.format(new Date()); // YYYY-MM-DD
		})()
	);

	const daysInMonth = $derived(
		new Date(Date.UTC(parsed.year, parsed.monthIndex + 1, 0)).getUTCDate()
	);
	const firstWeekday = $derived(new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).getUTCDay());

	const cells = $derived.by(() => {
		const out: Array<{ iso: string; day: number } | null> = [];
		for (let i = 0; i < firstWeekday; i++) out.push(null);
		for (let d = 1; d <= daysInMonth; d++) {
			out.push({ iso: isoDate(parsed.year, parsed.monthIndex, d), day: d });
		}
		while (out.length % 7 !== 0) out.push(null);
		return out;
	});

	const canGoPrev = $derived(!minMonth || month > minMonth);
	const canGoNext = $derived(!maxMonth || month < maxMonth);

	function prevMonth() {
		if (!canGoPrev) return;
		const m = parsed.monthIndex - 1;
		const year = m < 0 ? parsed.year - 1 : parsed.year;
		const monthIndex = (m + 12) % 12;
		onChangeMonth(formatMonth(year, monthIndex));
	}
	function nextMonth() {
		if (!canGoNext) return;
		const m = parsed.monthIndex + 1;
		const year = m > 11 ? parsed.year + 1 : parsed.year;
		const monthIndex = m % 12;
		onChangeMonth(formatMonth(year, monthIndex));
	}
</script>

<div class="bk-cal">
	<div class="bk-cal__head">
		<div>
			<h2 class="bk-cal__month">{monthLabel}</h2>
			<p class="bk-cal__hint">Pick a date that works for you</p>
		</div>
		<div class="bk-cal__nav">
			<button
				type="button"
				onclick={prevMonth}
				disabled={!canGoPrev}
				aria-label="Previous month"
				class="bk-cal__nav-btn"
			>
				<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
			</button>
			<button
				type="button"
				onclick={nextMonth}
				disabled={!canGoNext}
				aria-label="Next month"
				class="bk-cal__nav-btn"
			>
				<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
			</button>
		</div>
	</div>

	<div class="bk-cal__weekdays">
		{#each WEEKDAYS as wd (wd)}
			<div class="bk-cal__wd">{wd}</div>
		{/each}
	</div>

	<div class="bk-cal__grid" aria-busy={loading}>
		{#each cells as cell, i (i)}
			{#if cell === null}
				<div class="bk-cal__empty-cell"></div>
			{:else}
				{@const isPast = cell.iso < todayIso}
				{@const isAvailable = !isPast && availableDates.has(cell.iso) && !loading}
				{@const isSelected = selectedDate === cell.iso}
				{@const isToday = cell.iso === todayIso}
				<button
					type="button"
					disabled={!isAvailable}
					onclick={() => isAvailable && onSelectDate(cell.iso)}
					aria-label={cell.iso}
					aria-pressed={isSelected}
					class="bk-cal__day {isSelected
						? 'bk-cal__day--selected'
						: isAvailable
							? 'bk-cal__day--available'
							: loading && !isPast
								? 'bk-cal__day--loading'
								: isPast
									? 'bk-cal__day--past'
									: 'bk-cal__day--unavail'}"
				>
					<span>{cell.day}</span>
					{#if isToday && !isSelected}
						<span class="bk-cal__today-dot" aria-hidden="true"></span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
</div>
