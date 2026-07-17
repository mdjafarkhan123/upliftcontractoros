<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Calendar } from '$lib/components/ui/calendar';

	let {
		dateFrom = $bindable<string>(''),
		dateTo = $bindable<string>('')
	}: {
		dateFrom?: string;
		dateTo?: string;
	} = $props();

	const activeCount = $derived(dateFrom || dateTo ? 1 : 0);

	function clearAll() {
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
	<div class="contact-filter__section">
		<p class="contact-filter__heading">Requested date</p>
		<div class="request-filter__dates">
			<div class="request-filter__date">
				<span class="request-filter__date-label">From</span>
				<Calendar bind:value={dateFrom} placeholder="Start date" />
			</div>
			<div class="request-filter__date">
				<span class="request-filter__date-label">To</span>
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
<div class="request-filter__desktop">
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
<div class="request-filter__mobile">
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
					<span class="contact-filter__sheet-title">Filter Requests</span>
				</Sheet.Title>
			</Sheet.Header>
			{@render filterBody()}
		</Sheet.Content>
	</Sheet.Root>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	// Reuses the shared .contact-filter__* chrome (panel, sections, clear) — only
	// the responsive show/hide + date grid live here (same shape as Job/Quote
	// filter controls).
	.request-filter__desktop {
		display: none;
		@media (min-width: $bp-tablet) {
			display: block;
		}
	}
	.request-filter__mobile {
		@media (min-width: $bp-tablet) {
			display: none;
		}
	}

	.request-filter__dates {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: $space-2;
	}
	.request-filter__date {
		display: flex;
		flex-direction: column;
		gap: $space-1;
	}
	.request-filter__date-label {
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-secondary);
	}
</style>
