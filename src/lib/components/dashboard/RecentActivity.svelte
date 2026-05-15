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
		Briefcase,
		UserPlus,
		Star,
		Activity
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	let { rows }: { rows: DashboardActivityRow[] } = $props();

	const ICONS: Record<DashboardActivityIcon, Component> = {
		payment: Receipt,
		quote_accepted: CheckCircle2,
		quote_viewed: Eye,
		quote_declined: XCircle,
		opportunity_won: Trophy,
		job_completed: Briefcase,
		lead: UserPlus,
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
		const min = 60_000, hr = 3_600_000, day = 86_400_000;
		if (abs < hr) return rtf.format(Math.round(ms / min), 'minute');
		if (abs < day) return rtf.format(Math.round(ms / hr), 'hour');
		if (abs < day * 30) return rtf.format(Math.round(ms / day), 'day');
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function go(route: string) {
		goto(route);
	}
</script>

<section class="rounded-2xl border border-border bg-card">
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<h2 class="text-sm font-semibold text-foreground">Recent activity</h2>
	</header>

	{#if rows.length === 0}
		<div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
			<Activity class="h-5 w-5 text-muted-foreground" />
			<p class="text-sm font-medium text-foreground">No activity yet</p>
			<p class="text-xs text-muted-foreground">
				As leads, quotes, jobs, and payments come in, they'll show up here.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each rows as row (row.id)}
				{@const Icon = ICONS[row.icon_key]}
				{#if Icon}
					<li>
						<button
							type="button"
							onclick={() => go(row.target_route)}
							class="flex w-full min-h-[60px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
						>
							<span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted ${TONE[row.tone]}`}>
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
