<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { accentTile, type AccentKey } from './cardVisuals';
	import { cn } from '$lib/utils/cn';
	import { ChevronDown, Lock } from '@lucide/svelte';

	let {
		icon,
		accent,
		title,
		description,
		meta,
		enabled = $bindable(false),
		locked = false,
		lockedReason,
		expanded = false,
		onToggle,
		dirty = false,
		switchDisabled = false,
		children
	}: {
		icon: Component;
		accent: AccentKey;
		title: string;
		description: string;
		meta?: string;
		enabled?: boolean;
		locked?: boolean;
		lockedReason?: string;
		expanded?: boolean;
		onToggle?: () => void;
		dirty?: boolean;
		switchDisabled?: boolean;
		children?: Snippet;
	} = $props();

	const Icon = $derived(icon);
</script>

<section
	class={cn(
		'flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-all duration-150',
		expanded ? 'border-primary/30 shadow-dropdown' : 'border-border/60',
		!locked && !expanded && 'hover:border-primary/30 hover:shadow-dropdown',
		locked && 'opacity-70'
	)}
>
	<div class="flex items-center gap-2 p-4 md:p-5">
		<button
			type="button"
			disabled={locked}
			aria-expanded={expanded}
			onclick={() => onToggle?.()}
			class="flex min-h-[44px] flex-1 items-center gap-3.5 text-left disabled:cursor-default"
		>
			<span class={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', accentTile(accent))}>
				<Icon class="h-6 w-6" />
			</span>
			<span class="min-w-0 flex-1">
				<span class="flex items-center gap-1.5">
					<span class="truncate text-[15px] font-semibold text-foreground">{title}</span>
					{#if locked}<Lock class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
					{#if dirty && !locked}
						<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes"></span>
					{/if}
				</span>
				<span class="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{description}</span>
				<span class="mt-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
					{locked ? (lockedReason ?? 'Not available on your plan') : (meta ?? '')}
				</span>
			</span>
			{#if !locked}
				<ChevronDown
					class={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
					aria-hidden="true"
				/>
			{/if}
		</button>
		<Switch
			bind:checked={enabled}
			disabled={locked || switchDisabled}
			aria-label={`Toggle ${title}`}
		/>
	</div>

	{#if expanded && !locked}
		<div class="border-t border-border/60 p-4 md:p-5">
			{@render children?.()}
		</div>
	{/if}
</section>
