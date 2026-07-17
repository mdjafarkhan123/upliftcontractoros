<script lang="ts">
	import type { DashboardSummary } from '$lib/types/dashboard';
	import { formatCurrency } from '$lib/utils/format';

	let { attention }: { attention: DashboardSummary['attention'] } = $props();

	type Item = { icon: string; label: string; sub: string; href: string; toneMod: string };

	const items = $derived<Item[]>(
		[
			attention.overdue_invoices_count > 0 && {
				icon: 'ri-error-warning-line',
				label: `${attention.overdue_invoices_count} overdue invoice${attention.overdue_invoices_count === 1 ? '' : 's'}`,
				sub: `${formatCurrency(attention.overdue_invoices_total)} outstanding`,
				href: '/invoices?status=overdue',
				toneMod: 'widget-card__list-icon--danger'
			},
			attention.aging_leads_count > 0 && {
				icon: 'ri-time-line',
				label: `${attention.aging_leads_count} aging lead${attention.aging_leads_count === 1 ? '' : 's'}`,
				sub: 'No activity in 7+ days — follow up',
				href: '/contacts?status=lead',
				toneMod: 'widget-card__list-icon--warning'
			},
			attention.quotes_awaiting_count > 0 && {
				icon: 'ri-file-text-line',
				label: `${attention.quotes_awaiting_count} quote${attention.quotes_awaiting_count === 1 ? '' : 's'} awaiting reply`,
				sub: `${formatCurrency(attention.quotes_awaiting_total)} on the table`,
				href: '/quotes?status=sent',
				toneMod: 'widget-card__list-icon--warning'
			},
			attention.unread_conversations_count > 0 && {
				icon: 'ri-message-2-line',
				label: `${attention.unread_conversations_count} unread conversation${attention.unread_conversations_count === 1 ? '' : 's'}`,
				sub: 'New messages waiting in your inbox',
				href: '/inbox',
				toneMod: 'widget-card__list-icon--info'
			}
		].filter(Boolean) as Item[]
	);
</script>

<section class="widget-card">
	<header class="widget-card__header">
		<h2 class="widget-card__title">Needs your attention</h2>
	</header>

	{#if items.length === 0}
		<div class="widget-card__empty">
			<span class="widget-card__empty-icon">
				<i class="ri-checkbox-circle-line"></i>
			</span>
			<p class="widget-card__empty-title">You're all caught up.</p>
			<p class="widget-card__empty-sub">Nothing overdue, no quotes waiting, no unread messages.</p>
		</div>
	{:else}
		<ul class="widget-card__list">
			{#each items as item, i (i)}
				<li class="widget-card__list-item">
					<a href={item.href} class="widget-card__list-row">
						<span class={['widget-card__list-icon', item.toneMod].join(' ')}>
							<i class={item.icon}></i>
						</span>
						<span class="widget-card__list-content">
							<span class="widget-card__list-label">{item.label}</span>
							<span class="widget-card__list-sub">{item.sub}</span>
						</span>
						<i class="ri-arrow-right-s-line widget-card__chevron"></i>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
