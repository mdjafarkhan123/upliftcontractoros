<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Calendar } from '$lib/components/ui/calendar';

	type Salesperson = { id: string; full_name: string };

	let {
		issuedBy = $bindable<string>(''),
		dateFrom = $bindable<string>(''),
		dateTo = $bindable<string>(''),
		salespeople = [],
		showSalesperson = false
	}: {
		issuedBy?: string;
		dateFrom?: string;
		dateTo?: string;
		salespeople?: Salesperson[];
		showSalesperson?: boolean;
	} = $props();

	const activeCount = $derived(
		(showSalesperson && issuedBy ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)
	);

	function clearAll() {
		issuedBy = '';
		dateFrom = '';
		dateTo = '';
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
	{#if showSalesperson}
		<div class="contact-filter__section">
			<p class="contact-filter__heading">Salesperson</p>
			<div class="contact-filter__scope">
				<button
					type="button"
					onclick={() => (issuedBy = '')}
					class="contact-filter__scope-option"
					class:contact-filter__scope-option--active={issuedBy === ''}
				>
					<span class="contact-filter__radio">
						{#if issuedBy === ''}<span></span>{/if}
					</span>
					<span>Anyone</span>
				</button>
				{#each salespeople as s (s.id)}
					<button
						type="button"
						onclick={() => (issuedBy = s.id)}
						class="contact-filter__scope-option"
						class:contact-filter__scope-option--active={issuedBy === s.id}
					>
						<span class="contact-filter__radio">
							{#if issuedBy === s.id}<span></span>{/if}
						</span>
						<span>{s.full_name}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="contact-filter__section">
		<p class="contact-filter__heading">Created date</p>
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
					<span class="contact-filter__sheet-title">Filter Quotes</span>
				</Sheet.Title>
			</Sheet.Header>
			{@render filterBody()}
		</Sheet.Content>
	</Sheet.Root>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Reuses the shared .contact-filter__* + .job-filter__* chrome (Popover/Sheet,
	// sections, radio scope, date grid) so every entity's advanced filter is the
	// same control underneath. Only the responsive show/hide + date grid live here.
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
