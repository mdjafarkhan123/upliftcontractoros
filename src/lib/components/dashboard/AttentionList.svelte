<script lang="ts">
	import type { DashboardSummary } from '$lib/types/dashboard';
	import { formatCurrency } from '$lib/utils/format';
	import { AlertCircle, FileText, MessageSquare, Clock, ChevronRight } from '@lucide/svelte';

	let { attention }: { attention: DashboardSummary['attention'] } = $props();

	type Item = { icon: typeof AlertCircle; label: string; sub: string; href: string; tone: string };

	const items = $derived<Item[]>(
		[
			attention.overdue_invoices_count > 0 && {
				icon: AlertCircle,
				label: `${attention.overdue_invoices_count} overdue invoice${attention.overdue_invoices_count === 1 ? '' : 's'}`,
				sub: `${formatCurrency(attention.overdue_invoices_total)} outstanding`,
				href: '/invoices?status=overdue',
				tone: 'text-rose-500'
			},
			attention.aging_leads_count > 0 && {
				icon: Clock,
				label: `${attention.aging_leads_count} aging lead${attention.aging_leads_count === 1 ? '' : 's'}`,
				sub: 'No activity in 7+ days — follow up',
				href: '/contacts?status=lead',
				tone: 'text-orange-500'
			},
			attention.quotes_awaiting_count > 0 && {
				icon: FileText,
				label: `${attention.quotes_awaiting_count} quote${attention.quotes_awaiting_count === 1 ? '' : 's'} awaiting reply`,
				sub: `${formatCurrency(attention.quotes_awaiting_total)} on the table`,
				href: '/quotes?status=sent',
				tone: 'text-amber-500'
			},
			attention.unread_conversations_count > 0 && {
				icon: MessageSquare,
				label: `${attention.unread_conversations_count} unread conversation${attention.unread_conversations_count === 1 ? '' : 's'}`,
				sub: 'New messages waiting in your inbox',
				href: '/inbox',
				tone: 'text-sky-500'
			}
		].filter(Boolean) as Item[]
	);
</script>

<section
	class="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card dark:border-white/10"
>
	<header
		class="flex items-center justify-between border-b border-border/70 bg-card-raised/35 px-5 py-4"
	>
		<h2 class="text-base font-semibold tracking-tight text-foreground">Needs your attention</h2>
	</header>
	{#if items.length === 0}
		<div class="bg-muted/20 px-4 py-8 text-center">
			<p class="text-sm font-medium text-foreground">You're all caught up.</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Nothing overdue, no quotes waiting, no unread messages.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-border/60">
			{#each items as item, i (i)}
				<li>
					<a
						href={item.href}
						class="group flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-card-raised focus-visible:bg-card-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span
							class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-border/60 ${item.tone}`}
						>
							<item.icon class="h-4 w-4" />
						</span>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium text-foreground">{item.label}</span>
							<span class="truncate text-xs text-muted-foreground">{item.sub}</span>
						</span>
						<ChevronRight
							class="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
						/>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
