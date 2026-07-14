<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Calendar } from '$lib/components/ui/calendar';
	import { SUGGESTED_JOB_TAGS, formatJobTagLabel } from '$lib/jobs/jobMeta';

	type Assignee = { id: string; full_name: string };

	let {
		assignedTo = $bindable<string>(''),
		dateFrom = $bindable<string>(''),
		dateTo = $bindable<string>(''),
		tags = $bindable<string[]>([]),
		assignees = [],
		showTechnician = false
	}: {
		assignedTo?: string;
		dateFrom?: string;
		dateTo?: string;
		tags?: string[];
		assignees?: Assignee[];
		showTechnician?: boolean;
	} = $props();

	const activeCount = $derived(
		(showTechnician && assignedTo ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + tags.length
	);

	function setTag(next: string) {
		tags = tags.includes(next) ? tags.filter((t) => t !== next) : [...tags, next];
	}

	function clearAll() {
		assignedTo = '';
		dateFrom = '';
		dateTo = '';
		tags = [];
	}
</script>

{#snippet triggerContent()}
	<i class="ri-equalizer-line" aria-hidden="true"></i>
	<span>Filter</span>
	{#if activeCount > 0}
		<span class="contact-filter__count">{activeCount}</span>
	{/if}
{/snippet}

{#snippet filterBody()}
	{#if showTechnician}
		<div class="contact-filter__section">
			<p class="contact-filter__heading">Technician</p>
			<div class="contact-filter__scope">
				<button
					type="button"
					onclick={() => (assignedTo = '')}
					class="contact-filter__scope-option"
					class:contact-filter__scope-option--active={assignedTo === ''}
				>
					<span class="contact-filter__radio">
						{#if assignedTo === ''}<span></span>{/if}
					</span>
					<span>Anyone</span>
				</button>
				{#each assignees as a (a.id)}
					<button
						type="button"
						onclick={() => (assignedTo = a.id)}
						class="contact-filter__scope-option"
						class:contact-filter__scope-option--active={assignedTo === a.id}
					>
						<span class="contact-filter__radio">
							{#if assignedTo === a.id}<span></span>{/if}
						</span>
						<span>{a.full_name}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="contact-filter__section">
		<p class="contact-filter__heading">Scheduled date</p>
		<div class="job-filter__dates">
			<div class="job-filter__date">
				<span class="job-filter__date-label">From</span>
				<Calendar bind:value={dateFrom} placeholder="Start date" />
			</div>
			<div class="job-filter__date">
				<span class="job-filter__date-label">To</span>
				<Calendar bind:value={dateTo} min={dateFrom} placeholder="End date" />
			</div>
		</div>
	</div>

	<div class="contact-filter__section">
		<p class="contact-filter__heading">Tags</p>
		<div class="contact-filter__chips">
			{#each SUGGESTED_JOB_TAGS as t (t)}
				{@const active = tags.includes(t)}
				<button
					type="button"
					onclick={() => setTag(t)}
					aria-pressed={active}
					class="contact-filter__chip"
					class:contact-filter__chip--active={active}
				>
					{formatJobTagLabel(t)}
				</button>
			{/each}
		</div>
	</div>

	{#if activeCount > 0}
		<button type="button" onclick={clearAll} class="contact-filter__clear">
			Clear all filters
		</button>
	{/if}
{/snippet}

<!-- ── Desktop: Popover ──────────────────────────────────────────────── -->
<div class="job-filter__desktop">
	<Popover.Root>
		<Popover.Trigger>
			<span class="btn btn--secondary btn--sm">
				{@render triggerContent()}
			</span>
		</Popover.Trigger>
		<Popover.Content align="end" class="contact-filter__panel">
			{@render filterBody()}
		</Popover.Content>
	</Popover.Root>
</div>

<!-- ── Mobile: Bottom Sheet ──────────────────────────────────────────── -->
<div class="job-filter__mobile">
	<Sheet.Root>
		<Sheet.Trigger>
			<span class="btn btn--secondary btn--sm">
				{@render triggerContent()}
			</span>
		</Sheet.Trigger>
		<Sheet.Content side="bottom">
			<div class="contact-filter__sheet-grip" aria-hidden="true"></div>
			<Sheet.Header>
				<Sheet.Title>
					<span class="contact-filter__sheet-title">Filter Jobs</span>
				</Sheet.Title>
			</Sheet.Header>
			{@render filterBody()}
		</Sheet.Content>
	</Sheet.Root>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-filter__desktop {
		display: none;
		@media (min-width: $bp-tablet) {
			display: block;
		}
	}
	.job-filter__mobile {
		@media (min-width: $bp-tablet) {
			display: none;
		}
	}

	.job-filter__dates {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: $space-2;
	}
	.job-filter__date {
		display: flex;
		flex-direction: column;
		gap: $space-1;
	}
	.job-filter__date-label {
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
	}
</style>
