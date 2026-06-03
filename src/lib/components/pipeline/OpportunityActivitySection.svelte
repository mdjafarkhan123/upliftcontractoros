<script lang="ts">
	import {
		Activity,
		ArrowRightLeft,
		UserCog,
		Send,
		Eye,
		CheckCircle2,
		XCircle,
		Sparkles,
		Trophy,
		Frown
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { OpportunityActivity, OpportunityActivityKind } from '$lib/types/pipeline';

	type Props = {
		activity: OpportunityActivity[];
		hasQuotes: boolean;
		canCreate: boolean;
		newQuoteHref: string;
	};

	let { activity, hasQuotes, canCreate, newQuoteHref }: Props = $props();

	const ICONS: Record<OpportunityActivityKind, Component> = {
		stage: ArrowRightLeft,
		assignee: UserCog,
		quote_sent: Send,
		quote_viewed: Eye,
		quote_accepted: CheckCircle2,
		quote_declined: XCircle,
		created: Sparkles,
		won: Trophy,
		lost: Frown
	};

	const TONES: Record<OpportunityActivityKind, string> = {
		stage: 'text-muted-foreground',
		assignee: 'text-muted-foreground',
		quote_sent: 'text-blue-600 dark:text-blue-400',
		quote_viewed: 'text-amber-600 dark:text-amber-400',
		quote_accepted: 'text-emerald-600 dark:text-emerald-400',
		quote_declined: 'text-rose-600 dark:text-rose-400',
		created: 'text-emerald-600 dark:text-emerald-400',
		won: 'text-emerald-600 dark:text-emerald-400',
		lost: 'text-rose-600 dark:text-rose-400'
	};

	function relative(iso: string): string {
		const diffMs = Date.now() - new Date(iso).getTime();
		const m = Math.round(diffMs / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h}h`;
		const d = Math.round(h / 24);
		if (d < 30) return `${d}d`;
		const mo = Math.round(d / 30);
		if (mo < 12) return `${mo}mo`;
		return `${Math.round(mo / 12)}y`;
	}
</script>

<section class="rounded-xl border border-border bg-card">
	<header class="flex items-center gap-2 border-b border-border/60 px-3 py-2">
		<Activity class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
		<h3 class="text-sm font-semibold">Activity</h3>
	</header>

	{#if activity.length === 0}
		<div class="px-3 py-4 text-center">
			{#if !hasQuotes && canCreate}
				<p class="text-xs text-muted-foreground">
					No quotes yet — create one to move this opportunity forward.
				</p>
				<a
					href={newQuoteHref}
					class="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
				>
					Create a quote →
				</a>
			{:else}
				<p class="text-xs text-muted-foreground">No activity yet.</p>
			{/if}
		</div>
	{:else}
		<ul class="divide-y divide-border/40">
			{#each activity as a (a.id)}
				{@const Icon = ICONS[a.kind]}
				<li class="flex items-start gap-2.5 px-3 py-2">
					<Icon class={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TONES[a.kind]}`} aria-hidden="true" />
					<div class="min-w-0 flex-1">
						<p class="text-xs leading-snug text-foreground">{a.summary}</p>
					</div>
					<span
						class="shrink-0 text-[10px] tabular-nums text-muted-foreground"
						title={new Date(a.occurred_at).toLocaleString()}
					>
						{relative(a.occurred_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
