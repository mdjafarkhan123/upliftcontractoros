<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import type { AppointmentView, CalendarRange, CalendarDensity } from '$lib/types/appointments';

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

	let {
		view = $bindable<AppointmentView>('calendar'),
		range = $bindable<CalendarRange>('week'),
		anchor,
		canCreate,
		searchValue = $bindable(''),
		density = 'comfortable',
		onShiftAnchor,
		onGoToday,
		onFilterOpen,
		onRangeChange,
		onViewChange,
		onDensityChange,
		onNew
	}: {
		view: AppointmentView;
		range: CalendarRange;
		anchor: Date;
		canCreate: boolean;
		searchValue?: string;
		density?: CalendarDensity;
		onShiftAnchor: (dir: 1 | -1) => void;
		onGoToday: () => void;
		onFilterOpen: () => void;
		onRangeChange?: (r: CalendarRange) => void;
		onViewChange?: (v: AppointmentView) => void;
		onDensityChange?: (d: CalendarDensity) => void;
		// Opens the inline 3-tab quick-create popup (Job · Visit · Event).
		onNew: () => void;
	} = $props();

	let searchOpen = $state(false);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (searchOpen && searchInputEl) {
			tick().then(() => searchInputEl?.focus());
		}
	});

	const monthLabel = $derived.by(() => {
		const m = MONTH_NAMES[anchor.getMonth()];
		const y = anchor.getFullYear();
		if (view === 'calendar' && range === 'day') {
			return anchor.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		}
		return `${m} ${y}`;
	});

	function handleSearchInput(e: Event) {
		searchValue = (e.target as HTMLInputElement).value;
	}

	function closeSearch() {
		searchOpen = false;
		searchValue = '';
	}

	function setView(v: AppointmentView) {
		view = v;
		if (v === 'calendar' && searchOpen) {
			searchOpen = false;
			searchValue = '';
		}
		onViewChange?.(v);
	}

	function setRange(r: CalendarRange) {
		range = r;
		onRangeChange?.(r);
	}
</script>

<!--
  Slim calendar toolbar. The global app topbar (.topbar) renders search /
  theme / notifications / user on every page, so this owns only the
  calendar-specific controls: date nav, view toggles, filters, New.
-->
<header class="cal-header">
	<!-- LEFT: page title (desktop) + calendar nav / inline search -->
	<div class="cal-header__left">
		<h1 class="cal-header__title">Schedule</h1>

		{#if searchOpen}
			<!-- Inline search input (replaces nav in search mode) -->
			<div class="cal-header__search-inline">
				<i class="ri-search-line" aria-hidden="true"></i>
				<input
					bind:this={searchInputEl}
					type="search"
					placeholder="Search appointments…"
					value={searchValue}
					oninput={handleSearchInput}
					class="cal-header__search-input"
				/>
			</div>
		{:else if view === 'calendar'}
			<!-- Calendar navigation -->
			<button
				type="button"
				class="cal-header__nav-btn"
				onclick={() => onShiftAnchor(-1)}
				aria-label="Previous"
			>
				<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
			</button>
			<Button variant="outline" size="sm" class="cal-header__today" onclick={onGoToday}>
				Today
			</Button>
			<button
				type="button"
				class="cal-header__nav-btn"
				onclick={() => onShiftAnchor(1)}
				aria-label="Next"
			>
				<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
			</button>
			<span class="cal-header__month-label">{monthLabel}</span>
		{/if}
	</div>

	<!-- RIGHT: calendar controls -->
	<div class="cal-header__right">
		{#if searchOpen}
			<Button variant="ghost" size="sm" onclick={closeSearch}>Cancel</Button>
		{:else}
			<!-- Search toggle -->
			<button
				type="button"
				class="cal-header__icon-btn"
				onclick={() => (searchOpen = true)}
				aria-label="Search appointments"
			>
				<i class="ri-search-line" aria-hidden="true"></i>
			</button>

			<!-- List / Calendar view toggle -->
			<div class="cal-header__seg">
				<button
					type="button"
					class="cal-header__seg-btn"
					class:cal-header__seg-btn--active={view === 'list'}
					onclick={() => setView('list')}
				>
					<i class="ri-list-unordered" aria-hidden="true"></i>
					<span class="cal-header__seg-label">List</span>
				</button>
				<button
					type="button"
					class="cal-header__seg-btn"
					class:cal-header__seg-btn--active={view === 'calendar'}
					onclick={() => setView('calendar')}
				>
					<i class="ri-calendar-2-line" aria-hidden="true"></i>
					<span class="cal-header__seg-label">Calendar</span>
				</button>
			</div>

			<!-- Day / Week / Month toggle (calendar view only) -->
			{#if view === 'calendar'}
				<div class="cal-header__seg">
					<button
						type="button"
						class="cal-header__seg-btn"
						class:cal-header__seg-btn--active={range === 'day'}
						onclick={() => setRange('day')}
					>
						Day
					</button>
					<button
						type="button"
						class="cal-header__seg-btn"
						class:cal-header__seg-btn--active={range === 'week'}
						onclick={() => setRange('week')}
					>
						Week
					</button>
					<button
						type="button"
						class="cal-header__seg-btn"
						class:cal-header__seg-btn--active={range === 'month'}
						onclick={() => setRange('month')}
					>
						Month
					</button>
				</div>

				<!-- Density / zoom toggle (time-grid views) -->
				{#if range !== 'month' && onDensityChange}
					<div
						class="cal-header__seg cal-header__seg--density"
						role="group"
						aria-label="Grid density"
					>
						<button
							type="button"
							class="cal-header__seg-btn"
							class:cal-header__seg-btn--active={density === 'compact'}
							onclick={() => onDensityChange('compact')}
							title="Compact — fit more of the day"
						>
							<i class="ri-collapse-vertical-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="cal-header__seg-btn"
							class:cal-header__seg-btn--active={density === 'comfortable'}
							onclick={() => onDensityChange('comfortable')}
							title="Comfortable"
						>
							<i class="ri-equalizer-line" aria-hidden="true"></i>
						</button>
						<button
							type="button"
							class="cal-header__seg-btn"
							class:cal-header__seg-btn--active={density === 'spacious'}
							onclick={() => onDensityChange('spacious')}
							title="Spacious — bigger cards"
						>
							<i class="ri-expand-vertical-line" aria-hidden="true"></i>
						</button>
					</div>
				{/if}
			{/if}

			<!-- Mobile: filter sheet button -->
			<button
				type="button"
				class="cal-header__icon-btn cal-header__icon-btn--filter"
				onclick={onFilterOpen}
				aria-label="Filters"
			>
				<i class="ri-equalizer-line" aria-hidden="true"></i>
			</button>

			<!-- New appointment -->
			{#if canCreate}
				<Button size="sm" onclick={onNew}>
					<i class="ri-calendar-event-line" aria-hidden="true"></i>
					<span class="cal-header__seg-label">New</span>
				</Button>
			{/if}
		{/if}
	</div>
</header>
