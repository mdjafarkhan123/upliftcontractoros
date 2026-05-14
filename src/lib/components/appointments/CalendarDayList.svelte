<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import AppointmentStatusBadge from './AppointmentStatusBadge.svelte';
	import { addDays, dayKey, formatDayLabel, formatTime, isSameDay } from '$lib/utils/calendar';
	import type { AppointmentListItem } from '$lib/types/appointments';

	let {
		anchor,
		days,
		items
	}: { anchor: Date; days: number; items: AppointmentListItem[] } = $props();

	const today = new Date();

	const buckets = $derived.by(() => {
		const map = new Map<string, AppointmentListItem[]>();
		for (let i = 0; i < days; i++) {
			map.set(dayKey(addDays(anchor, i)), []);
		}
		for (const item of items) {
			const k = dayKey(new Date(item.scheduled_start));
			const list = map.get(k);
			if (list) list.push(item);
		}
		return Array.from(map.entries()).map(([k, list]) => ({
			key: k,
			date: new Date(`${k}T00:00:00`),
			items: list
		}));
	});
</script>

<div class="space-y-4">
	{#each buckets as bucket (bucket.key)}
		<section>
			<h3
				class={[
					'mb-2 text-sm font-semibold',
					isSameDay(bucket.date, today) ? 'text-primary' : 'text-foreground'
				].join(' ')}
			>
				{formatDayLabel(bucket.date)}
				{#if isSameDay(bucket.date, today)}
					<span class="ml-1 text-xs font-normal text-muted-foreground">· Today</span>
				{/if}
			</h3>
			{#if bucket.items.length === 0}
				<p class="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
					Nothing scheduled.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each bucket.items as item (item.id)}
						<li>
							<a
								href={`/appointments/${item.id}`}
								class="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40 active:bg-accent/60"
							>
								<div class="w-16 shrink-0 text-xs font-medium text-muted-foreground">
									{formatTime(item.scheduled_start)}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-foreground">{item.title}</p>
									<p class="truncate text-xs text-muted-foreground">{item.contact_name}</p>
								</div>
								<AppointmentStatusBadge status={item.status} />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}

	{#if items.length === 0}
		<EmptyState title="No appointments" description="Nothing in this range." />
	{/if}
</div>
