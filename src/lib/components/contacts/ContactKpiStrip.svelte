<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { formatCurrency } from '$lib/utils/format';
	import { DollarSign, FileText, Hammer, Clock, CalendarClock, Flame } from '@lucide/svelte';

	let {
		lifetime_revenue,
		open_quotes_count,
		open_quotes_value,
		active_jobs_count,
		last_contacted_at,
		next_follow_up_at,
		contactId
	}: {
		lifetime_revenue: number;
		open_quotes_count: number;
		open_quotes_value: number;
		active_jobs_count: number;
		last_contacted_at: string | null;
		next_follow_up_at: string | null;
		contactId: string;
	} = $props();

	const followUpOverdue = $derived(
		next_follow_up_at !== null && new Date(next_follow_up_at).getTime() <= Date.now()
	);

	function relativeDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		const now = Date.now();
		const diff = now - d.getTime();
		const mins = Math.floor(diff / 60_000);
		const hours = Math.floor(diff / 3_600_000);
		const days = Math.floor(diff / 86_400_000);
		if (mins < 1) return 'Just now';
		if (mins < 60) return `${mins}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days === 1) return 'Yesterday';
		if (days < 7) return `${days}d ago`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function futureDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		const now = Date.now();
		if (d.getTime() <= now) return 'Overdue';
		const days = Math.ceil((d.getTime() - now) / 86_400_000);
		if (days === 0) return 'Today';
		if (days === 1) return 'Tomorrow';
		if (days < 7) return `In ${days}d`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	const kpis = $derived([
		{
			label: 'Lifetime',
			value: formatCurrency(lifetime_revenue),
			icon: DollarSign,
			iconClass: 'bg-primary/10 text-primary',
			valueClass: lifetime_revenue > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
			href: null as string | null
		},
		{
			label: open_quotes_count === 1 ? '1 Open Quote' : `${open_quotes_count} Open Quotes`,
			value: open_quotes_count > 0 ? formatCurrency(open_quotes_value) : '—',
			icon: FileText,
			iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
			valueClass: open_quotes_count > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
			href: open_quotes_count > 0 ? `/quotes?contact=${contactId}` : null
		},
		{
			label: 'Active Jobs',
			value: String(active_jobs_count),
			icon: Hammer,
			iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
			valueClass: active_jobs_count > 0 ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground',
			href: active_jobs_count > 0 ? `/jobs?contact_id=${contactId}` : null
		},
		{
			label: 'Last Contact',
			value: relativeDate(last_contacted_at),
			icon: Clock,
			iconClass: 'bg-muted text-muted-foreground',
			valueClass: 'text-foreground',
			href: null as string | null
		},
		{
			label: 'Next Follow-up',
			value: futureDate(next_follow_up_at),
			icon: CalendarClock,
			iconClass: followUpOverdue
				? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
				: 'bg-muted text-muted-foreground',
			valueClass: followUpOverdue
				? 'text-orange-700 dark:text-orange-400'
				: next_follow_up_at
					? 'text-foreground'
					: 'text-muted-foreground',
			href: null as string | null
		}
	]);
</script>

<!-- Mobile: horizontal scroll strip; Desktop: 5-col grid -->
<div
	class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-5 md:overflow-visible md:pb-0"
	aria-label="Contact KPIs"
>
	{#each kpis as kpi (kpi.label)}
		{#if kpi.href}
			<a
				href={kpi.href}
				class="group flex min-w-[130px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5 shadow-card transition-all duration-150 hover:border-primary/30 hover:shadow-dropdown md:min-w-0"
			>
				<div class="flex items-center justify-between gap-2">
					<p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						{kpi.label}
					</p>
					<div class={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', kpi.iconClass)}>
						<kpi.icon class="h-3.5 w-3.5" />
					</div>
				</div>
				<p class={cn('text-lg font-bold tracking-tight', kpi.valueClass)}>{kpi.value}</p>
			</a>
		{:else}
			<div
				class="flex min-w-[130px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5 shadow-card md:min-w-0"
			>
				<div class="flex items-center justify-between gap-2">
					<p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						{kpi.label}
					</p>
					<div class={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', kpi.iconClass)}>
						{#if kpi.label === 'Next Follow-up' && followUpOverdue}
							<Flame class="h-3.5 w-3.5" />
						{:else}
							<kpi.icon class="h-3.5 w-3.5" />
						{/if}
					</div>
				</div>
				<p class={cn('text-lg font-bold tracking-tight', kpi.valueClass)}>{kpi.value}</p>
			</div>
		{/if}
	{/each}
</div>
