<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import { Lock, ArrowUpRight, TrendingUp, TrendingDown, Minus } from '@lucide/svelte';

	type Trend = { label: string; direction: 'up' | 'down' | 'flat'; positive: boolean };

	let {
		label,
		value,
		hint,
		trend,
		icon: Icon,
		tone = 'default',
		featured = false,
		locked = false,
		lockedMessage,
		href,
		class: className
	}: {
		label: string;
		value: string;
		hint?: string;
		/** Optional delta-vs-last-month chip. Colour follows `positive`, arrow follows `direction`. */
		trend?: Trend;
		icon?: Component;
		tone?: 'default' | 'success' | 'warning' | 'danger';
		/** Featured card — dark green gradient surface, white text. Used for the lead KPI. */
		featured?: boolean;
		locked?: boolean;
		lockedMessage?: string;
		href?: string;
		class?: string;
	} = $props();

	const TrendIcon = $derived(
		trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus
	);

	const trendPill = $derived(
		featured
			? 'bg-white/10 text-white/90 ring-white/20'
			: !trend || trend.direction === 'flat'
				? 'bg-muted text-muted-foreground ring-border/60'
				: trend.positive
					? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
					: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
	);

	const toneRing = $derived(
		featured
			? 'bg-white/15 text-white ring-white/20'
			: tone === 'success'
				? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
				: tone === 'warning'
					? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20'
					: tone === 'danger'
						? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
						: 'bg-primary/10 text-primary ring-primary/20'
	);

	const Tag = $derived(href && !locked ? 'a' : 'div');
</script>

<svelte:element
	this={Tag}
	href={Tag === 'a' ? href : undefined}
	class={cn(
		'group relative flex min-h-[150px] flex-col justify-between rounded-2xl p-5 shadow-card transition-all duration-200 ease-out md:min-h-[170px] md:p-6',
		featured
			? 'border border-[hsl(var(--brand-deep))]/40 bg-gradient-to-br from-[hsl(var(--brand-primary))] via-[hsl(var(--brand-primary))] to-[hsl(var(--brand-deep))] text-white'
			: 'border border-border/70 bg-card dark:border-white/10',
		Tag === 'a' &&
			(featured
				? 'hover:-translate-y-0.5 hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
				: 'hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'),
		className
	)}
>
	<div class="flex items-start justify-between gap-3">
		<span
			class={cn(
				'text-sm font-medium leading-tight',
				featured ? 'text-white/85' : 'text-muted-foreground'
			)}
		>
			{label}
		</span>
		{#if Tag === 'a' && !locked}
			<span
				class={cn(
					'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5',
					featured
						? 'bg-white/10 text-white ring-white/25'
						: 'bg-card text-muted-foreground ring-border/70 group-hover:text-foreground'
				)}
			>
				<ArrowUpRight class="h-4 w-4" />
			</span>
		{:else if Icon}
			<span
				class={cn(
					'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
					toneRing
				)}
			>
				<Icon class="h-4 w-4" />
			</span>
		{/if}
	</div>
	<div class={cn('mt-3 flex flex-col gap-2', locked && 'select-none blur-sm')}>
		<span
			class={cn(
				'text-3xl font-semibold leading-none tracking-tight md:text-4xl',
				featured ? 'text-white' : 'text-foreground'
			)}
		>
			{value}
		</span>
		{#if trend || hint}
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				{#if trend}
					<span
						class={cn(
							'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
							trendPill
						)}
					>
						<TrendIcon class="h-3 w-3" />
						{trend.label}
					</span>
				{/if}
				{#if hint}
					<span
						class={cn('text-xs', featured ? 'text-white/70' : 'text-muted-foreground')}
					>
						{hint}
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if locked}
		<div
			class={cn(
				'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl text-center',
				featured ? 'bg-[hsl(var(--brand-deep))]/70 text-white' : 'bg-card/75 text-muted-foreground'
			)}
		>
			<Lock class="h-4 w-4" />
			<span class="px-3 text-xs">
				{lockedMessage ?? "You don't have access to this metric"}
			</span>
		</div>
	{/if}
</svelte:element>
