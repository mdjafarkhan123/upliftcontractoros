<script lang="ts">
	import { goto } from '$app/navigation';
	import type {
		DashboardActivityRow,
		DashboardActivityIcon,
		DashboardActivityTone
	} from '$lib/types/dashboard';
	import {
		Receipt,
		CheckCircle2,
		Eye,
		XCircle,
		Trophy,
		TrendingDown,
		Sparkles,
		ArrowRightLeft,
		Briefcase,
		UserPlus,
		UserCheck,
		Star,
		Activity,
		Send,
		UserCog
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	let { rows }: { rows: DashboardActivityRow[] } = $props();

	const ICONS: Record<DashboardActivityIcon, Component> = {
		payment: Receipt,
		quote_accepted: CheckCircle2,
		quote_viewed: Eye,
		quote_declined: XCircle,
		quote_sent: Send,
		opportunity_created: Sparkles,
		opportunity_stage_changed: ArrowRightLeft,
		opportunity_assignee_changed: UserCog,
		opportunity_won: Trophy,
		opportunity_lost: TrendingDown,
		job_completed: Briefcase,
		lead: UserPlus,
		contact_became_customer: UserCheck,
		review_received: Star
	};

	const TONE: Record<DashboardActivityTone, string> = {
		neutral: 'text-sky-500',
		positive: 'text-emerald-500',
		attention: 'text-amber-500',
		negative: 'text-rose-500'
	};

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	function relative(iso: string): string {
		const ms = Date.parse(iso) - Date.now();
		const abs = Math.abs(ms);
		const min = 60_000,
			hr = 3_600_000,
			day = 86_400_000;
		if (abs < hr) return rtf.format(Math.round(ms / min), 'minute');
		if (abs < day) return rtf.format(Math.round(ms / hr), 'hour');
		if (abs < day * 30) return rtf.format(Math.round(ms / day), 'day');
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function go(route: string) {
		goto(route);
	}
</script>

<section
	class="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card dark:border-white/10"
>
	<header
		class="flex items-center justify-between border-b border-border/70 bg-card-raised/35 px-5 py-4"
	>
		<h2 class="text-base font-semibold tracking-tight text-foreground">Recent activity</h2>
	</header>

	{#if rows.length === 0}
		<div class="flex flex-col items-center gap-2 bg-muted/20 px-6 py-10 text-center">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<Activity class="h-5 w-5 text-muted-foreground" />
			</div>
			<p class="text-sm font-medium text-foreground">No activity yet</p>
			<p class="text-xs text-muted-foreground">
				As leads, quotes, jobs, and payments come in, they'll show up here.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-border/60">
			{#each rows as row (row.id)}
				{@const Icon = ICONS[row.icon_key]}
				{#if Icon}
					<li>
						<button
							type="button"
							onclick={() => go(row.target_route)}
							class="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-card-raised focus-visible:bg-card-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span
								class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-border/60 ${TONE[row.tone]}`}
							>
								<Icon class="h-4 w-4" />
							</span>
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="truncate text-sm font-medium text-foreground">{row.label}</span>
								<span class="text-xs text-muted-foreground">{relative(row.occurred_at)}</span>
							</span>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</section>
