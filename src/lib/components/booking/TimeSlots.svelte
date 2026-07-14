<script lang="ts">
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
	<div class="bk-slots__skeleton">
		{#each Array(6) as _, i (i)}
			<div class="bk-slots__skel-item"></div>
		{/each}
	</div>
{:else if slots.length === 0}
	<div class="bk-slots__empty">
		<p class="bk-slots__empty-title">No availability on this date</p>
		<p class="bk-slots__empty-sub">Please select another day from the calendar.</p>
	</div>
{:else}
	<div class="bk-slots__groups">
		{#each groups as group (group.label)}
			<div>
				<div class="bk-slots__group-label">{group.label}</div>
				<div class="bk-slots__grid">
					{#each group.items as slot (slot.iso)}
						{@const isSelected = selectedSlot === slot.iso}
						<button
							type="button"
							onclick={() => onSelect(slot.iso)}
							aria-pressed={isSelected}
							class="bk-slot {isSelected ? 'bk-slot--selected' : ''}"
						>
							{slot.label}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
