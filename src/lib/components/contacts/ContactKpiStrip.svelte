<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';

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
			icon: 'ri-money-dollar-circle-line',
			iconTone: 'brand',
			valueTone: lifetime_revenue > 0 ? 'brand' : '',
			href: null as string | null
		},
		{
			label: open_quotes_count === 1 ? '1 Open Quote' : `${open_quotes_count} Open Quotes`,
			value: open_quotes_count > 0 ? formatCurrency(open_quotes_value) : '—',
			icon: 'ri-file-text-line',
			iconTone: 'amber',
			valueTone: open_quotes_count > 0 ? 'amber' : 'muted',
			href: open_quotes_count > 0 ? `/quotes?contact=${contactId}` : null
		},
		{
			label: 'Active Jobs',
			value: String(active_jobs_count),
			icon: 'ri-hammer-line',
			iconTone: 'blue',
			valueTone: active_jobs_count > 0 ? 'blue' : 'muted',
			href: active_jobs_count > 0 ? `/jobs?contact_id=${contactId}` : null
		},
		{
			label: 'Last Contact',
			value: relativeDate(last_contacted_at),
			icon: 'ri-time-line',
			iconTone: 'muted',
			valueTone: '',
			href: null as string | null
		},
		{
			label: 'Next Follow-up',
			value: futureDate(next_follow_up_at),
			icon: followUpOverdue ? 'ri-fire-line' : 'ri-calendar-schedule-line',
			iconTone: followUpOverdue ? 'warn' : 'muted',
			valueTone: followUpOverdue ? 'warn' : next_follow_up_at ? '' : 'muted',
			href: null as string | null
		}
	]);
</script>

<!-- Mobile: horizontal scroll strip; Desktop: 5-col grid -->
<div class="contact-kpis" aria-label="Contact KPIs">
	{#each kpis as kpi (kpi.label)}
		<svelte:element
			this={kpi.href ? 'a' : 'div'}
			href={kpi.href}
			class="contact-kpis__tile"
			class:contact-kpis__tile--link={kpi.href}
		>
			<div class="contact-kpis__top">
				<p class="contact-kpis__label">{kpi.label}</p>
				<div class="contact-kpis__icon contact-kpis__icon--{kpi.iconTone}">
					<i class={kpi.icon} aria-hidden="true"></i>
				</div>
			</div>
			<p class="contact-kpis__value contact-kpis__value--{kpi.valueTone || 'default'}">{kpi.value}</p>
		</svelte:element>
	{/each}
</div>
