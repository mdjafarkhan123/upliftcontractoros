<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

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
	const firstWeekday = $derived(
		new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)).getUTCDay()
	);

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

<div class="w-full">
	<div class="mb-5 flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold tracking-tight text-foreground">{monthLabel}</h2>
			<p class="mt-0.5 text-xs text-muted-foreground">Pick a date that works for you</p>
		</div>
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={prevMonth}
				disabled={!canGoPrev}
				aria-label="Previous month"
				class="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-all duration-150 ease-out hover:border-border hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-card"
			>
				<ChevronLeft class="h-5 w-5" />
			</button>
			<button
				type="button"
				onclick={nextMonth}
				disabled={!canGoNext}
				aria-label="Next month"
				class="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-all duration-150 ease-out hover:border-border hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-card"
			>
				<ChevronRight class="h-5 w-5" />
			</button>
		</div>
	</div>

	<div class="mb-2 grid grid-cols-7 gap-1">
		{#each WEEKDAYS as wd (wd)}
			<div class="py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
				{wd}
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-7 gap-1" aria-busy={loading}>
		{#each cells as cell, i (i)}
			{#if cell === null}
				<div class="aspect-square"></div>
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
					class={cn(
						'group relative aspect-square min-h-[44px] rounded-xl text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
						isSelected &&
							'bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--brand-primary)/0.6)]',
						!isSelected && isAvailable &&
							'bg-card/60 text-foreground hover:bg-accent hover:shadow-[0_4px_14px_-6px_hsl(var(--brand-primary)/0.4)]',
						!isAvailable && !isPast && !loading && 'text-muted-foreground/30',
						isPast && 'text-muted-foreground/20',
						loading && !isSelected && 'animate-pulse bg-muted/40 text-transparent'
					)}
				>
					<span class="relative z-10">{cell.day}</span>
					{#if isToday && !isSelected}
						<span
							class="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
							aria-hidden="true"
						></span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
</div>
