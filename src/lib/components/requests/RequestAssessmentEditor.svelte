<script lang="ts">
	// On-site assessment schedule block (Jobber's 11/13.jpg) — used by the New
	// Request page now and the request detail page's inline edit in R3. Composed
	// from the same shared primitives as the job schedule block (Calendar,
	// TimePicker, Switch, CrewPicker); it is NOT the job editor because that one
	// owns job-only concerns (one-off/recurring, billing, client notify).
	import { Switch } from '$lib/components/ui/switch';
	import { Calendar } from '$lib/components/ui/calendar';
	import { TimePicker } from '$lib/components/ui/time-picker';
	import CrewPicker from '$lib/components/appointments/CrewPicker.svelte';

	type Assignee = { id: string; full_name: string };

	let {
		instructions = $bindable(''),
		startDate = $bindable(''),
		endDate = $bindable(''),
		startTime = $bindable(''),
		endTime = $bindable(''),
		scheduleLater = $bindable(false),
		anytime = $bindable(false),
		selectedIds = $bindable<string[]>([]),
		leadId = $bindable<string | null>(null),
		errors = {}
	}: {
		instructions?: string;
		startDate?: string; // YYYY-MM-DD
		endDate?: string;
		startTime?: string; // HH:mm or ''
		endTime?: string;
		scheduleLater?: boolean;
		anytime?: boolean;
		selectedIds?: string[];
		leadId?: string | null;
		errors?: Record<string, string>;
	} = $props();

	// Crew options — same shared endpoint every scheduling surface uses.
	let assignees = $state<Assignee[]>([]);
	let assigneesLoaded = false;
	$effect(() => {
		if (assigneesLoaded) return;
		assigneesLoaded = true;
		void fetch('/api/appointments/assignees').then(async (res) => {
			if (!res.ok) return;
			const body = (await res.json()) as { assignees: Assignee[] };
			assignees = body.assignees;
		});
	});

	// Keep the end date from drifting before the start.
	$effect(() => {
		if (startDate && endDate && endDate < startDate) endDate = startDate;
	});
</script>

<div class="request-assessment">
	<textarea
		class="request-assessment__instructions"
		bind:value={instructions}
		placeholder="Instructions"
		rows="3"
	></textarea>

	<div class="request-assessment__grid">
		<!-- Schedule -->
		<div class="request-assessment__col">
			<p class="request-assessment__heading">Schedule</p>

			<div class="request-assessment__toggle">
				<Switch bind:checked={scheduleLater} id="assessment-schedule-later" />
				<label for="assessment-schedule-later">Schedule later</label>
			</div>

			{#if !scheduleLater}
				<div class="request-assessment__dates">
					<div class="request-assessment__field">
						<span class="request-assessment__label">Start date</span>
						<Calendar bind:value={startDate} placeholder="Start date" />
					</div>
					<div class="request-assessment__field">
						<span class="request-assessment__label">End date</span>
						<Calendar bind:value={endDate} min={startDate} placeholder="End date" />
					</div>
				</div>
				{#if errors.startDate}
					<p class="request-assessment__error">{errors.startDate}</p>
				{/if}

				<div class="request-assessment__toggle">
					<Switch bind:checked={anytime} id="assessment-anytime" />
					<label for="assessment-anytime">Anytime — no set time</label>
				</div>

				{#if !anytime}
					<div class="request-assessment__dates">
						<div class="request-assessment__field">
							<span class="request-assessment__label">Start time</span>
							<TimePicker bind:value={startTime} preferNow />
						</div>
						<div class="request-assessment__field">
							<span class="request-assessment__label">End time</span>
							<TimePicker bind:value={endTime} min={startDate === endDate ? startTime : ''} />
						</div>
					</div>
					{#if errors.endTime}
						<p class="request-assessment__error">{errors.endTime}</p>
					{/if}
				{/if}
			{:else}
				<p class="request-assessment__hint">
					The assessment is saved without a date — it shows as Unscheduled until you pick one.
				</p>
			{/if}
		</div>

		<!-- Team -->
		<div class="request-assessment__col">
			<p class="request-assessment__heading">Team</p>
			<CrewPicker {assignees} bind:selectedIds bind:leadId />
		</div>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.request-assessment {
		display: flex;
		flex-direction: column;
		gap: $space-4;

		&__instructions {
			width: 100%;
			min-height: 72px;
			padding: $space-3;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-text-primary);
			font-size: $fs-body;
			font-family: inherit;
			resize: vertical;

			&:focus {
				outline: none;
				border-color: var(--color-brand);
			}
		}

		&__grid {
			display: grid;
			grid-template-columns: 1fr;
			gap: $space-5;

			@media (min-width: $bp-tablet) {
				grid-template-columns: 1fr 1fr;
			}
		}

		&__col {
			display: flex;
			flex-direction: column;
			gap: $space-3;
			min-width: 0;
		}

		&__heading {
			margin: 0;
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__dates {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: $space-2;
		}

		&__field {
			display: flex;
			flex-direction: column;
			gap: $space-1;
			min-width: 0;
		}

		&__label {
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: var(--color-text-secondary);
		}

		&__toggle {
			display: flex;
			align-items: center;
			gap: $space-2;

			label {
				font-size: $fs-body;
				color: var(--color-text-primary);
				cursor: pointer;
			}
		}

		&__hint {
			margin: 0;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}

		&__error {
			margin: 0;
			font-size: $fs-caption;
			color: var(--danger-solid);
		}
	}
</style>
