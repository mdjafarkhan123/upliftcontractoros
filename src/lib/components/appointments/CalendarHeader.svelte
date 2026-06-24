<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		ChevronLeft,
		ChevronRight,
		CalendarPlus,
		CalendarDays,
		List,
		Filter,
		Search,
		X
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
	import UserMenu from '$lib/components/app-shell/UserMenu.svelte';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { getMemberContext } from '$lib/context/member';
	import { cn } from '$lib/utils/cn';
	import type { AppointmentView, CalendarRange } from '$lib/types/appointments';

	const MONTH_NAMES = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	let {
		view = $bindable<AppointmentView>('calendar'),
		range = $bindable<CalendarRange>('week'),
		anchor,
		canCreate,
		searchValue = $bindable(''),
		onShiftAnchor,
		onGoToday,
		onFilterOpen,
		onRangeChange,
		onViewChange
	}: {
		view: AppointmentView;
		range: CalendarRange;
		anchor: Date;
		canCreate: boolean;
		searchValue?: string;
		onShiftAnchor: (dir: 1 | -1) => void;
		onGoToday: () => void;
		onFilterOpen: () => void;
		onRangeChange?: (r: CalendarRange) => void;
		onViewChange?: (v: AppointmentView) => void;
	} = $props();

	// Global desktop controls (same as PageWrapper)
	function readCtx<T>(read: () => () => T): (() => T) | null {
		try { return read(); } catch { return null; }
	}
	const org = readCtx(getOrgContext);
	const member = readCtx(getMemberContext);

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
				weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
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
  Sticky page header — mirrors the PageWrapper header pattern.
  On desktop: shows page title + calendar controls + global app controls (UserMenu, etc.)
  On mobile:  compact calendar controls only (global controls live in AppHeader / BottomNav)
-->
<header
	class="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background px-4 md:min-h-16 md:px-6 md:py-3"
>
	<!-- LEFT: page title (desktop) + calendar nav -->
	<div class="flex min-w-0 items-center gap-2">
		<!-- "Appointments" label — desktop only, acts as page title -->
		<h1 class="hidden text-xl font-semibold leading-tight tracking-tight text-foreground md:mr-2 md:block md:text-2xl">
			Appointments
		</h1>

		{#if searchOpen}
			<!-- Inline search input (replaces nav in search mode) -->
			<div class="flex items-center gap-2">
				<Search class="h-4 w-4 shrink-0 text-muted-foreground" />
				<input
					bind:this={searchInputEl}
					type="search"
					placeholder="Search appointments…"
					value={searchValue}
					oninput={handleSearchInput}
					class="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground md:w-64"
				/>
			</div>
		{:else if view === 'calendar'}
			<!-- Calendar navigation -->
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8 shrink-0"
				onclick={() => onShiftAnchor(-1)}
				aria-label="Previous"
			>
				<ChevronLeft class="h-4 w-4" />
			</Button>
			<Button variant="outline" size="sm" class="h-8 shrink-0 px-3 text-xs" onclick={onGoToday}>
				Today
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8 shrink-0"
				onclick={() => onShiftAnchor(1)}
				aria-label="Next"
			>
				<ChevronRight class="h-4 w-4" />
			</Button>
			<span class="ml-1 hidden truncate text-sm font-medium text-muted-foreground sm:block">
				{monthLabel}
			</span>
		{/if}
	</div>

	<!-- RIGHT: calendar controls + global desktop controls -->
	<div class="flex shrink-0 items-center gap-1.5">
		{#if searchOpen}
			<Button variant="ghost" size="sm" class="h-8" onclick={closeSearch}>
				Cancel
			</Button>
		{:else}
			<!-- Search toggle -->
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8"
				onclick={() => (searchOpen = true)}
				aria-label="Search appointments"
			>
				<Search class="h-4 w-4" />
			</Button>

			<!-- List / Calendar view toggle -->
			<div class="hidden items-center rounded-md border border-border bg-muted/30 p-0.5 sm:inline-flex">
				<Button
					variant={view === 'list' ? 'default' : 'ghost'}
					size="sm"
					class="h-7 px-2.5 text-xs"
					onclick={() => setView('list')}
				>
					<List class="h-3.5 w-3.5" />
					<span class="hidden md:inline">List</span>
				</Button>
				<Button
					variant={view === 'calendar' ? 'default' : 'ghost'}
					size="sm"
					class="h-7 px-2.5 text-xs"
					onclick={() => setView('calendar')}
				>
					<CalendarDays class="h-3.5 w-3.5" />
					<span class="hidden md:inline">Calendar</span>
				</Button>
			</div>

			<!-- Day / Week toggle (calendar view only) -->
			{#if view === 'calendar'}
				<div class="hidden items-center rounded-md border border-border bg-muted/30 p-0.5 sm:inline-flex">
					<Button
						variant={range === 'day' ? 'default' : 'ghost'}
						size="sm"
						class="h-7 px-2.5 text-xs"
						onclick={() => setRange('day')}
					>
						Day
					</Button>
					<Button
						variant={range === 'week' ? 'default' : 'ghost'}
						size="sm"
						class="h-7 px-2.5 text-xs"
						onclick={() => setRange('week')}
					>
						Week
					</Button>
					<Button
						variant={range === 'month' ? 'default' : 'ghost'}
						size="sm"
						class="h-7 px-2.5 text-xs"
						onclick={() => setRange('month')}
					>
						Month
					</Button>
				</div>
			{/if}

			<!-- Mobile: filter sheet button -->
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8 lg:hidden"
				onclick={onFilterOpen}
				aria-label="Filters"
			>
				<Filter class="h-4 w-4" />
			</Button>

			<!-- New appointment -->
			{#if canCreate}
				<Button href="/appointments/new" size="sm" class="h-8">
					<CalendarPlus class="h-4 w-4" />
					<span class="hidden sm:inline">New</span>
				</Button>
			{/if}

			<!-- Desktop-only global controls (UserMenu, notifications, theme) —
			     mirrors what PageWrapper renders at md+, since AppHeader is md:hidden -->
			{#if org && member}
				<div class="ml-1 hidden items-center gap-2.5 md:flex">
					<div class="h-8 w-px bg-border/60" aria-hidden="true"></div>
					<div class="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/70 p-1 shadow-card">
						<button
							type="button"
							onclick={() => (commandPalette.open = true)}
							class="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Search (⌘K)"
						>
							<Search class="h-4 w-4" />
						</button>
						<ThemeToggle />
						<NotificationBell />
					</div>
					<div class="flex items-center rounded-full border border-border/60 bg-card-raised/90 p-[3px] shadow-card transition-shadow duration-200 hover:shadow-dropdown">
						<UserMenu member={member()} org={org()} />
					</div>
				</div>
			{/if}
		{/if}
	</div>
</header>
