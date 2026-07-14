<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { SUGGESTED_CONTACT_TAGS, formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { LEAD_TEMPERATURES, TEMPERATURE_META } from '$lib/contacts/temperature';

	type ScopeValue = 'mine' | 'team' | 'unassigned';
	type TemperatureValue = '' | 'hot' | 'warm' | 'cold';

	const SCOPE_OPTIONS: { value: ScopeValue; label: string; description: string }[] = [
		{ value: 'mine', label: 'Mine', description: 'Assigned to me' },
		{ value: 'team', label: 'Whole team', description: 'All contacts' },
		{ value: 'unassigned', label: 'Unassigned', description: 'No owner yet' }
	];

	const TEMP_DOT: Record<'hot' | 'warm' | 'cold', string> = {
		hot: '#f97316',
		warm: '#f59e0b',
		cold: '#0ea5e9'
	};

	let {
		scope = $bindable<ScopeValue>('team'),
		tag = $bindable<string>(''),
		temperature = $bindable<TemperatureValue>(''),
		showScope = false
	}: {
		scope?: ScopeValue;
		tag?: string;
		temperature?: TemperatureValue;
		showScope?: boolean;
	} = $props();

	const activeCount = $derived(
		(showScope && scope !== 'team' ? 1 : 0) + (tag ? 1 : 0) + (temperature ? 1 : 0)
	);

	function setTag(next: string) {
		tag = tag === next ? '' : next;
	}

	function setTemperature(next: TemperatureValue) {
		temperature = temperature === next ? '' : next;
	}

	function clearAll() {
		scope = 'team';
		tag = '';
		temperature = '';
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
	{#if showScope}
		<div class="contact-filter__section">
			<p class="contact-filter__heading">Assigned to</p>
			<div class="contact-filter__scope">
				{#each SCOPE_OPTIONS as opt (opt.value)}
					<button
						type="button"
						onclick={() => (scope = opt.value)}
						class="contact-filter__scope-option"
						class:contact-filter__scope-option--active={scope === opt.value}
					>
						<span class="contact-filter__radio">
							{#if scope === opt.value}<span></span>{/if}
						</span>
						<span>
							<span>{opt.label}</span>
							<span class="contact-filter__scope-desc">{opt.description}</span>
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="contact-filter__section">
		<p class="contact-filter__heading">Lead temperature</p>
		<div class="contact-filter__chips">
			{#each LEAD_TEMPERATURES as t (t)}
				{@const active = temperature === t}
				{@const meta = TEMPERATURE_META[t]}
				<button
					type="button"
					onclick={() => setTemperature(t)}
					aria-pressed={active}
					class="contact-filter__chip"
					class:contact-filter__chip--active={active}
				>
					<span
						class="contact-filter__chip-dot"
						style:background-color={active ? undefined : TEMP_DOT[t]}
					></span>
					{meta.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="contact-filter__section">
		<p class="contact-filter__heading">Tag</p>
		<div class="contact-filter__chips">
			{#each SUGGESTED_CONTACT_TAGS as t (t)}
				{@const active = tag === t}
				{@const destructive = isDestructiveTag(t)}
				<button
					type="button"
					onclick={() => setTag(t)}
					aria-pressed={active}
					class="contact-filter__chip"
					class:contact-filter__chip--active={active}
					class:contact-filter__chip--danger={destructive}
				>
					{formatTagLabel(t)}
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
<div class="contact-filter__desktop">
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
<div class="contact-filter__mobile">
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
					<span class="contact-filter__sheet-title">Filter Contacts</span>
				</Sheet.Title>
			</Sheet.Header>
			{@render filterBody()}
		</Sheet.Content>
	</Sheet.Root>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-filter__desktop {
		display: none;
		@media (min-width: $bp-tablet) {
			display: block;
		}
	}
	.contact-filter__mobile {
		@media (min-width: $bp-tablet) {
			display: none;
		}
	}
</style>
