<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { WEEKDAY_PILLS, WEEKDAY_LONG } from '$lib/jobs/recurrence';
	import type { RecurrenceFreq, MonthMode, MonthCell } from '$lib/jobs/recurrence';

	// The repeat rule's "shape" fields (everything the modal owns). Start/end dates and
	// the end condition live on the page, not here — the modal only sets HOW it repeats.
	export type RecurrenceShape = {
		freq: RecurrenceFreq;
		interval: number;
		weekdays: number[];
		month_mode: MonthMode;
		month_days: number[];
		month_last_day: boolean;
		// Month "Day of week": the tapped grid cells (1st..4th × Sun..Sat). Each cell is one
		// occurrence a month — independent, never a cartesian product of weeks and weekdays.
		month_cells: MonthCell[];
	};

	let {
		open = $bindable(false),
		value,
		onsave
	}: {
		open: boolean;
		value: RecurrenceShape;
		onsave: (v: RecurrenceShape) => void;
	} = $props();

	// Local draft — committed to the page only on Save, discarded on Cancel/close.
	// Must be $state (not $derived): the modal mutates it as the user picks the
	// frequency and day pills. A $derived would recompute from `value` and revert
	// every selection. It is (re)seeded from `value` on open by the $effect below.
	let draft = $state<RecurrenceShape>(clone(value));

	// Re-seed the draft from the page each time the modal opens, so cancelling truly
	// reverts and re-opening shows the last saved rule.
	let prevOpen = false;
	$effect(() => {
		if (open && !prevOpen) draft = clone(value);
		prevOpen = open;
	});

	function clone(v: RecurrenceShape): RecurrenceShape {
		return {
			freq: v.freq,
			interval: v.interval,
			weekdays: [...v.weekdays],
			month_mode: v.month_mode,
			month_days: [...v.month_days],
			month_last_day: v.month_last_day,
			month_cells: v.month_cells.map((c) => ({ ...c }))
		};
	}

	function toggle(arr: number[], n: number): number[] {
		return arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n];
	}

	const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
	const WEEKS = [1, 2, 3, 4];

	function cellOn(week: number, weekday: number): boolean {
		return draft.month_cells.some((c) => c.week === week && c.weekday === weekday);
	}

	function toggleCell(week: number, weekday: number) {
		draft.month_cells = cellOn(week, weekday)
			? draft.month_cells.filter((c) => !(c.week === week && c.weekday === weekday))
			: [...draft.month_cells, { week, weekday }];
	}

	// Save is only meaningful once the active mode has a selection. 'day' and 'year' are fully
	// described by the interval + the job's start date, so they're always saveable.
	const canSave = $derived.by(() => {
		if (draft.freq === 'day' || draft.freq === 'year') return true;
		if (draft.freq === 'week') return draft.weekdays.length > 0;
		if (draft.month_mode === 'day_of_month')
			return draft.month_days.length > 0 || draft.month_last_day;
		return draft.month_cells.length > 0;
	});

	// Spec: Clear resets the modal to its default state (Every = 1, Unit = Week, nothing
	// selected) — it does not close the modal.
	function clearAll() {
		draft = {
			freq: 'week',
			interval: 1,
			weekdays: [],
			month_mode: 'day_of_month',
			month_days: [],
			month_last_day: false,
			month_cells: []
		};
	}

	function save() {
		if (!canSave) return;
		onsave(clone(draft));
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="recur-modal" showClose={false}>
		<div class="recur-modal__head">
			<h2 class="recur-modal__title">Set up recurring schedule</h2>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<!-- Every N Week/Month -->
		<div class="recur-modal__every">
			<span class="recur-modal__every-label">Every</span>
			<input
				type="number"
				min="1"
				max="52"
				class="field__input recur-modal__interval"
				bind:value={draft.interval}
				aria-label="Interval"
			/>
			<div class="recur-modal__freq">
				<Select.Root bind:value={draft.freq}>
					<Select.Trigger><Select.Value /></Select.Trigger>
					<Select.Content>
						<Select.Item value="day" label="Day">Day</Select.Item>
						<Select.Item value="week" label="Week">Week</Select.Item>
						<Select.Item value="month" label="Month">Month</Select.Item>
						<Select.Item value="year" label="Year">Year</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			{#if draft.freq !== 'day' && draft.freq !== 'year'}
				<span class="recur-modal__every-on">on</span>
			{/if}
		</div>

		{#if draft.freq === 'day'}
			<!-- Every N days needs no day/month selection — the interval is the whole rule. -->
			<p class="recur-modal__day-note">
				This visit repeats every {draft.interval > 1 ? `${draft.interval} days` : 'day'}.
			</p>
		{:else if draft.freq === 'year'}
			<!-- Every N years needs no selection either — the start date carries month + day. -->
			<p class="recur-modal__day-note">
				This visit repeats every {draft.interval > 1 ? `${draft.interval} years` : 'year'} on the job's
				start date.
			</p>
		{:else if draft.freq === 'week'}
			<!-- S M T W T F S pills -->
			<div class="recur-modal__pills">
				{#each WEEKDAY_PILLS as label, i (i)}
					<button
						type="button"
						class="recur-pill"
						class:recur-pill--on={draft.weekdays.includes(i)}
						aria-pressed={draft.weekdays.includes(i)}
						onclick={() => (draft.weekdays = toggle(draft.weekdays, i))}
					>
						{label}
					</button>
				{/each}
			</div>
		{:else}
			<!-- Day of month / Day of week -->
			<div class="recur-modal__mode">
				<button
					type="button"
					class="recur-radio"
					class:recur-radio--on={draft.month_mode === 'day_of_month'}
					onclick={() => (draft.month_mode = 'day_of_month')}
				>
					<span class="recur-radio__dot"></span> Day of month
				</button>
				<button
					type="button"
					class="recur-radio"
					class:recur-radio--on={draft.month_mode === 'day_of_week'}
					onclick={() => (draft.month_mode = 'day_of_week')}
				>
					<span class="recur-radio__dot"></span> Day of week
				</button>
			</div>

			{#if draft.month_mode === 'day_of_month'}
				<div class="recur-modal__monthgrid">
					{#each MONTH_DAYS as d (d)}
						<button
							type="button"
							class="recur-day"
							class:recur-day--on={draft.month_days.includes(d)}
							aria-pressed={draft.month_days.includes(d)}
							onclick={() => (draft.month_days = toggle(draft.month_days, d))}
						>
							{d}
						</button>
					{/each}
					<button
						type="button"
						class="recur-day recur-day--last"
						class:recur-day--on={draft.month_last_day}
						aria-pressed={draft.month_last_day}
						onclick={() => (draft.month_last_day = !draft.month_last_day)}
					>
						Last day
					</button>
				</div>
			{:else}
				<!-- Week-of-month × weekday GRID: each cell is one independent occurrence, so
				     "1st Monday + 3rd Thursday" is exactly two visits a month. -->
				<div class="recur-grid" role="group" aria-label="Day of week">
					{#each WEEKS as w (w)}
						<span class="recur-grid__rowlabel">{w}{['st', 'nd', 'rd', 'th'][w - 1]}</span>
						<div class="recur-grid__row">
							{#each WEEKDAY_PILLS as label, i (i)}
								<button
									type="button"
									class="recur-cell"
									class:recur-cell--on={cellOn(w, i)}
									aria-pressed={cellOn(w, i)}
									aria-label="{w}{['st', 'nd', 'rd', 'th'][w - 1]} {WEEKDAY_LONG[i]}"
									onclick={() => toggleCell(w, i)}
								>
									{label}
								</button>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		<div class="recur-modal__foot">
			<Button variant="ghost" onclick={clearAll}>Clear</Button>
			<div class="recur-modal__foot-right">
				<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button onclick={save} disabled={!canSave}>Save</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	:global(.dialog-content.recur-modal) {
		max-width: 480px;
		padding: $space-5;
	}

	.recur-modal {
		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: $space-4;
		}

		&__title {
			font-size: $fs-h3;
			font-weight: 700;
			color: var(--color-text-primary);
		}

		&__every {
			display: flex;
			align-items: center;
			gap: $space-3;
			margin-bottom: $space-4;
		}

		&__every-label,
		&__every-on {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__interval {
			width: 72px;
			text-align: center;
		}

		&__freq {
			min-width: 130px;
		}

		&__pills {
			display: flex;
			gap: $space-2;
		}

		&__mode {
			display: flex;
			gap: $space-5;
			margin-bottom: $space-4;
		}

		&__monthgrid {
			display: grid;
			grid-template-columns: repeat(7, 1fr);
			gap: $space-2;
		}

		&__day-note {
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__foot {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-top: $space-5;
		}

		&__foot-right {
			display: flex;
			gap: $space-2;
		}
	}

	.recur-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: $radius-md;
		border: 1px solid var(--color-border);
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s ease;

		&:hover {
			border-color: var(--color-brand);
		}

		&--on {
			background: var(--color-brand);
			border-color: var(--color-brand);
			color: var(--color-text-on-brand);
		}
	}

	// Month "Day of week": 1st..4th rows × S M T W T F S columns, boxed like the reference.
	.recur-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: $space-2 $space-3;

		&__rowlabel {
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__row {
			display: grid;
			grid-template-columns: repeat(7, 1fr);
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			overflow: hidden;
		}
	}

	.recur-cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 40px;
		border: none;
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s ease;

		&:hover {
			background: var(--color-bg-surface-sunk);
		}

		&--on {
			background: var(--color-brand);
			color: var(--color-text-on-brand);
		}
	}

	.recur-radio {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		border: none;
		background: transparent;
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: 500;
		cursor: pointer;

		&__dot {
			width: 18px;
			height: 18px;
			border-radius: 50%;
			border: 2px solid var(--color-border);
			position: relative;
		}

		&--on &__dot {
			border-color: var(--color-brand);

			&::after {
				content: '';
				position: absolute;
				inset: 3px;
				border-radius: 50%;
				background: var(--color-brand);
			}
		}
	}

	.recur-day {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 40px;
		border-radius: $radius-md;
		border: 1px solid var(--color-border);
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s ease;

		&:hover {
			border-color: var(--color-brand);
		}

		&--last {
			grid-column: span 3;
		}

		&--on {
			background: var(--color-brand);
			border-color: var(--color-brand);
			color: var(--color-text-on-brand);
		}
	}
</style>
