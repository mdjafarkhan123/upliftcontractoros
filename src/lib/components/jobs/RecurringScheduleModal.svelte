<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { WEEKDAY_PILLS } from '$lib/jobs/recurrence';
	import type { RecurrenceFreq, MonthMode } from '$lib/jobs/recurrence';

	// The repeat rule's "shape" fields (everything the modal owns). Start/end dates and
	// the end condition live on the page, not here — the modal only sets HOW it repeats.
	export type RecurrenceShape = {
		freq: RecurrenceFreq;
		interval: number;
		weekdays: number[];
		month_mode: MonthMode;
		month_days: number[];
		month_last_day: boolean;
		month_weeks: number[];
		month_weekdays: number[];
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
			month_weeks: [...v.month_weeks],
			month_weekdays: [...v.month_weekdays]
		};
	}

	function toggle(arr: number[], n: number): number[] {
		return arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n];
	}

	const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
	const WEEKS = [1, 2, 3, 4];

	// Save is only meaningful once the active mode has a selection.
	const canSave = $derived.by(() => {
		if (draft.freq === 'week') return draft.weekdays.length > 0;
		if (draft.month_mode === 'day_of_month')
			return draft.month_days.length > 0 || draft.month_last_day;
		return draft.month_weeks.length > 0 && draft.month_weekdays.length > 0;
	});

	function clearAll() {
		draft.weekdays = [];
		draft.month_days = [];
		draft.month_last_day = false;
		draft.month_weeks = [];
		draft.month_weekdays = [];
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
						<Select.Item value="week">Week</Select.Item>
						<Select.Item value="month">Month</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<span class="recur-modal__every-on">on</span>
		</div>

		{#if draft.freq === 'week'}
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
				<!-- Week-of-month × weekday: backend generates every combination, so we pick
				     the weeks and the weekdays separately (their cartesian product). -->
				<div class="recur-modal__group">
					<p class="recur-modal__group-label">On week(s)</p>
					<div class="recur-modal__pills recur-modal__pills--weeks">
						{#each WEEKS as w (w)}
							<button
								type="button"
								class="recur-pill recur-pill--wide"
								class:recur-pill--on={draft.month_weeks.includes(w)}
								aria-pressed={draft.month_weeks.includes(w)}
								onclick={() => (draft.month_weeks = toggle(draft.month_weeks, w))}
							>
								{w}{['st', 'nd', 'rd', 'th'][w - 1]}
							</button>
						{/each}
					</div>
				</div>
				<div class="recur-modal__group">
					<p class="recur-modal__group-label">On day(s)</p>
					<div class="recur-modal__pills">
						{#each WEEKDAY_PILLS as label, i (i)}
							<button
								type="button"
								class="recur-pill"
								class:recur-pill--on={draft.month_weekdays.includes(i)}
								aria-pressed={draft.month_weekdays.includes(i)}
								onclick={() => (draft.month_weekdays = toggle(draft.month_weekdays, i))}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<div class="recur-modal__foot">
			<Button variant="ghost" onclick={clearAll}>Clear</Button>
			<div class="recur-modal__foot-right">
				<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button onclick={save} disabled={!canSave}>
					Save
				</Button>
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

			&--weeks {
				flex-wrap: wrap;
			}
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

		&__group {
			& + & {
				margin-top: $space-4;
			}
		}

		&__group-label {
			font-size: $fs-body;
			color: var(--color-text-muted);
			margin-bottom: $space-2;
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

		&--wide {
			width: auto;
			padding: 0 $space-3;
		}

		&:hover {
			border-color: var(--color-brand);
		}

		&--on {
			background: var(--color-brand);
			border-color: var(--color-brand);
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
