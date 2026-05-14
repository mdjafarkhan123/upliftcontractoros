<script lang="ts">
	import { addDays, dayKey, isSameDay, formatTime } from '$lib/utils/calendar';
	import type { AppointmentListItem } from '$lib/types/appointments';

	let {
		anchor,
		items
	}: { anchor: Date; items: AppointmentListItem[] } = $props();

	const today = new Date();

	const days = $derived.by(() => {
		const out: { date: Date; key: string; items: AppointmentListItem[] }[] = [];
		for (let i = 0; i < 7; i++) {
			const d = addDays(anchor, i);
			out.push({ date: d, key: dayKey(d), items: [] });
		}
		for (const item of items) {
			const k = dayKey(new Date(item.scheduled_start));
			const slot = out.find((s) => s.key === k);
			if (slot) slot.items.push(item);
		}
		return out;
	});

	const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
</script>

<div class="grid grid-cols-7 gap-2">
	{#each days as day (day.key)}
		<div class="min-h-[14rem] rounded-lg border border-border bg-card p-2">
			<div
				class={[
					'mb-2 flex items-baseline justify-between',
					isSameDay(day.date, today) ? 'text-primary' : 'text-foreground'
				].join(' ')}
			>
				<span class="text-xs font-semibold uppercase tracking-wide">
					{weekdayFmt.format(day.date)}
				</span>
				<span class="text-lg font-bold">{day.date.getDate()}</span>
			</div>

			<ul class="space-y-1.5">
				{#each day.items as item (item.id)}
					<li>
						<a
							href={`/appointments/${item.id}`}
							class={[
								'block rounded-md px-2 py-1.5 text-xs transition-colors',
								item.status === 'cancelled' || item.status === 'no_show'
									? 'bg-destructive/10 text-destructive line-through hover:bg-destructive/20'
									: item.status === 'completed'
										? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400'
										: 'bg-primary/10 text-foreground hover:bg-primary/20'
							].join(' ')}
						>
							<p class="font-medium">{formatTime(item.scheduled_start)}</p>
							<p class="truncate">{item.title}</p>
							<p class="truncate text-[10px] opacity-75">{item.contact_name}</p>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
