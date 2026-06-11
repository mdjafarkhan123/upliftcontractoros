<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { SlidersHorizontal } from '@lucide/svelte';
	import { SUGGESTED_CONTACT_TAGS, formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { LEAD_TEMPERATURES, TEMPERATURE_META } from '$lib/contacts/temperature';

	type ScopeValue = 'mine' | 'team' | 'unassigned';
	type TemperatureValue = '' | 'hot' | 'warm' | 'cold';

	const SCOPE_OPTIONS: { value: ScopeValue; label: string; description: string }[] = [
		{ value: 'mine', label: 'Mine', description: 'Assigned to me' },
		{ value: 'team', label: 'Whole team', description: 'All contacts' },
		{ value: 'unassigned', label: 'Unassigned', description: 'No owner yet' }
	];

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
	<SlidersHorizontal class="h-4 w-4 shrink-0" />
	<span class="hidden sm:inline">Filter</span>
	{#if activeCount > 0}
		<span
			class="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
		>
			{activeCount}
		</span>
	{/if}
{/snippet}

{#snippet filterBody()}
	{#if showScope}
		<div class="border-b border-border/60 p-4">
			<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Assigned to
			</p>
			<div class="flex flex-col gap-1">
				{#each SCOPE_OPTIONS as opt (opt.value)}
					<button
						type="button"
						onclick={() => (scope = opt.value)}
						class={cn(
							'flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150',
							scope === opt.value
								? 'bg-primary/10 text-primary'
								: 'text-foreground hover:bg-accent'
						)}
					>
						<span
							class={cn(
								'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
								scope === opt.value ? 'border-primary' : 'border-border'
							)}
						>
							{#if scope === opt.value}
								<span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
							{/if}
						</span>
						<span>
							<span class="font-medium">{opt.label}</span>
							<span class="ml-1.5 text-xs text-muted-foreground">{opt.description}</span>
						</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="border-b border-border/60 p-4">
		<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			Lead temperature
		</p>
		<div class="flex flex-wrap gap-2">
			{#each LEAD_TEMPERATURES as t (t)}
				{@const active = temperature === t}
				{@const meta = TEMPERATURE_META[t]}
				<button
					type="button"
					onclick={() => setTemperature(t)}
					aria-pressed={active}
					class={cn(
						'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
						active
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground'
					)}
				>
					<span
						class={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-primary-foreground' : meta.dot)}
					></span>
					{meta.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="p-4">
		<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tag</p>
		<div class="flex flex-wrap gap-2">
			{#each SUGGESTED_CONTACT_TAGS as t (t)}
				{@const active = tag === t}
				{@const destructive = isDestructiveTag(t)}
				<button
					type="button"
					onclick={() => setTag(t)}
					aria-pressed={active}
					class={cn(
						'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors duration-150',
						active
							? destructive
								? 'border-destructive bg-destructive text-destructive-foreground'
								: 'border-primary bg-primary text-primary-foreground'
							: destructive
								? 'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10'
								: 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground'
					)}
				>
					{formatTagLabel(t)}
				</button>
			{/each}
		</div>
	</div>

	{#if activeCount > 0}
		<div class="border-t border-border/60 px-4 py-3">
			<button
				type="button"
				onclick={clearAll}
				class="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				Clear all filters
			</button>
		</div>
	{/if}
{/snippet}

<!-- ── Desktop: Popover ──────────────────────────────────────────────── -->
<div class="hidden lg:block">
	<Popover.Root>
		<Popover.Trigger>
			<Button variant="outline" size="sm" class="h-9 gap-1.5">
				{@render triggerContent()}
			</Button>
		</Popover.Trigger>
		<Popover.Content align="end" class="w-80 p-0">
			{@render filterBody()}
		</Popover.Content>
	</Popover.Root>
</div>

<!-- ── Mobile: Bottom Sheet ──────────────────────────────────────────── -->
<div class="lg:hidden">
	<Sheet.Root>
		<Sheet.Trigger>
			<Button variant="outline" size="sm" class="h-9 gap-1.5">
				{@render triggerContent()}
			</Button>
		</Sheet.Trigger>
		<Sheet.Content side="bottom" class="rounded-t-2xl border-border/50 bg-card px-0 pb-safe">
			<div class="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" aria-hidden="true"></div>
			<Sheet.Header class="px-6 pb-2 pt-4">
				<Sheet.Title class="text-base font-semibold">Filter Contacts</Sheet.Title>
			</Sheet.Header>
			{@render filterBody()}
		</Sheet.Content>
	</Sheet.Root>
</div>
