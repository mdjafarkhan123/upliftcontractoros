<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils/cn';
	import { Lock } from '@lucide/svelte';

	let {
		label,
		value,
		hint,
		icon: Icon,
		tone = 'default',
		locked = false,
		lockedMessage,
		href,
		class: className
	}: {
		label: string;
		value: string;
		hint?: string;
		icon?: Component;
		tone?: 'default' | 'success' | 'warning' | 'danger';
		locked?: boolean;
		lockedMessage?: string;
		href?: string;
		class?: string;
	} = $props();

	const toneRing = $derived(
		tone === 'success'
			? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
			: tone === 'warning'
				? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20'
				: tone === 'danger'
					? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
					: 'bg-primary/10 text-primary ring-primary/20'
	);
	const toneIcon = $derived(
		tone === 'success'
			? 'text-emerald-600 dark:text-emerald-400'
			: tone === 'warning'
				? 'text-amber-600 dark:text-amber-400'
				: tone === 'danger'
					? 'text-rose-600 dark:text-rose-400'
					: 'text-primary'
	);

	const Tag = $derived(href && !locked ? 'a' : 'div');
</script>

<svelte:element
	this={Tag}
	href={Tag === 'a' ? href : undefined}
	class={cn(
		'relative flex min-h-[116px] flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-200 ease-out dark:border-white/10',
		Tag === 'a' &&
			'hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
		className
	)}
>
	<div class="flex items-start justify-between gap-3">
		<span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
		{#if Icon}
			<span
				class={cn(
					'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
					toneRing
				)}
			>
				<Icon class={cn('h-4 w-4', toneIcon)} />
			</span>
		{/if}
	</div>
	<div class={cn('mt-2 flex flex-col gap-0.5', locked && 'select-none blur-sm')}>
		<span class="text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl"
			>{value}</span
		>
		{#if hint}
			<span class="text-xs text-muted-foreground">{hint}</span>
		{/if}
	</div>

	{#if locked}
		<div
			class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-card/75 text-center backdrop-blur-[2px]"
		>
			<Lock class="h-4 w-4 text-muted-foreground" />
			<span class="px-3 text-xs text-muted-foreground">
				{lockedMessage ?? 'You don’t have access to this metric'}
			</span>
		</div>
	{/if}
</svelte:element>
