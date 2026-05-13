<script lang="ts">
	import { GitBranch, Briefcase, FileText, Receipt, MessageSquare, ChevronRight } from '@lucide/svelte';
	import type { Component } from 'svelte';

	type Counts = {
		opportunities: number;
		jobs: number;
		quotes: number;
		invoices: number;
		conversations: number;
	};

	let { contactId, counts }: { contactId: string; counts: Counts } = $props();

	type Row = { label: string; href: string; count: number; icon: Component };

	const rows: Row[] = $derived([
		{
			label: 'Opportunities',
			href: `/pipeline?contact=${contactId}`,
			count: counts.opportunities,
			icon: GitBranch
		},
		{ label: 'Jobs', href: `/jobs?contact=${contactId}`, count: counts.jobs, icon: Briefcase },
		{ label: 'Quotes', href: `/quotes?contact=${contactId}`, count: counts.quotes, icon: FileText },
		{
			label: 'Invoices',
			href: `/invoices?contact=${contactId}`,
			count: counts.invoices,
			icon: Receipt
		},
		{
			label: 'Conversations',
			href: `/inbox?contact=${contactId}`,
			count: counts.conversations,
			icon: MessageSquare
		}
	]);
</script>

<ul class="space-y-2">
	{#each rows as row (row.label)}
		<li>
			<a
				href={row.href}
				class="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"
					>
						<row.icon class="h-4 w-4" />
					</div>
					<div>
						<p class="text-sm font-medium text-foreground">{row.label}</p>
						<p class="text-xs text-muted-foreground">
							{row.count} {row.count === 1 ? 'record' : 'records'}
						</p>
					</div>
				</div>
				<ChevronRight class="h-4 w-4 text-muted-foreground" />
			</a>
		</li>
	{/each}
</ul>
<p class="mt-3 text-xs text-muted-foreground">
	Linked records are read-only here for now. Open each module to manage them.
</p>
