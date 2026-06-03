<script lang="ts">
	import { cn } from '$lib/utils/cn';

	type Props = {
		slots: string[]; // ISO UTC strings
		loading: boolean;
		timezone: string;
		selectedSlot: string | null;
		onSelect: (iso: string) => void;
	};

	let { slots, loading, timezone, selectedSlot, onSelect }: Props = $props();

	const formatter = $derived(
		new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: timezone
		})
	);

	// Group slots by morning / afternoon / evening for a refined feel.
	type Group = { label: string; items: { iso: string; label: string }[] };
	const groups = $derived.by<Group[]>(() => {
		const morning: { iso: string; label: string }[] = [];
		const afternoon: { iso: string; label: string }[] = [];
		const evening: { iso: string; label: string }[] = [];
		for (const iso of slots) {
			const d = new Date(iso);
			const hour = Number(
				new Intl.DateTimeFormat('en-US', {
					hour: 'numeric',
					hour12: false,
					timeZone: timezone
				}).format(d)
			);
			const item = { iso, label: formatter.format(d) };
			if (hour < 12) morning.push(item);
			else if (hour < 17) afternoon.push(item);
			else evening.push(item);
		}
		const out: Group[] = [];
		if (morning.length) out.push({ label: 'Morning', items: morning });
		if (afternoon.length) out.push({ label: 'Afternoon', items: afternoon });
		if (evening.length) out.push({ label: 'Evening', items: evening });
		return out;
	});
</script>

{#if loading}
	<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
		{#each Array(6) as _, i (i)}
			<div class="h-12 animate-pulse rounded-xl bg-muted/40"></div>
		{/each}
	</div>
{:else if slots.length === 0}
	<div class="rounded-2xl border border-border/60 bg-muted px-6 py-10 text-center">
		<p class="text-sm font-medium text-foreground">No availability on this date</p>
		<p class="mt-1 text-xs text-muted-foreground">Please select another day from the calendar.</p>
	</div>
{:else}
	<div class="space-y-5">
		{#each groups as group (group.label)}
			<div>
				<div class="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
					{group.label}
				</div>
				<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
					{#each group.items as slot (slot.iso)}
						{@const isSelected = selectedSlot === slot.iso}
						<button
							type="button"
							onclick={() => onSelect(slot.iso)}
							aria-pressed={isSelected}
							class={cn(
								'min-h-[48px] rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
								isSelected
									? 'border-primary/60 bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--brand-primary)/0.6)]'
									: 'border-border/60 bg-muted text-foreground hover:border-border hover:bg-accent hover:shadow-[0_4px_14px_-6px_hsl(var(--brand-primary)/0.4)]'
							)}
						>
							{slot.label}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
