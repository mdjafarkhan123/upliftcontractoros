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
			? 'ring-emerald-500/20'
			: tone === 'warning'
				? 'ring-amber-500/20'
				: tone === 'danger'
					? 'ring-rose-500/20'
					: 'ring-border'
	);
	const toneIcon = $derived(
		tone === 'success'
			? 'text-emerald-500'
			: tone === 'warning'
				? 'text-amber-500'
				: tone === 'danger'
					? 'text-rose-500'
					: 'text-muted-foreground'
	);

	const Tag = $derived(href && !locked ? 'a' : 'div');
</script>

<svelte:element
	this={Tag}
	href={Tag === 'a' ? href : undefined}
	class={cn(
		'relative flex min-h-[112px] flex-col justify-between rounded-2xl border border-border bg-card p-4 ring-1 ring-inset transition-shadow',
		toneRing,
		Tag === 'a' && 'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
		className
	)}
>
	<div class="flex items-start justify-between gap-3">
		<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
		{#if Icon}
			<Icon class={cn('h-4 w-4', toneIcon)} />
		{/if}
	</div>
	<div class={cn('mt-2 flex flex-col gap-0.5', locked && 'select-none blur-sm')}>
		<span class="text-2xl font-semibold leading-tight text-foreground md:text-3xl">{value}</span>
		{#if hint}
			<span class="text-xs text-muted-foreground">{hint}</span>
		{/if}
	</div>

	{#if locked}
		<div
			class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-card/60 text-center backdrop-blur-[2px]"
		>
			<Lock class="h-4 w-4 text-muted-foreground" />
			<span class="px-3 text-xs text-muted-foreground">
				{lockedMessage ?? 'You don’t have access to this metric'}
			</span>
		</div>
	{/if}
</svelte:element>
