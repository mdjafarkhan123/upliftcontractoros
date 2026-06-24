<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';

	let { current }: { current: 'customer' | 'build' | 'send' } = $props();

	const steps = [
		{ key: 'customer', label: 'Customer', n: 1 },
		{ key: 'build', label: 'Build', n: 2 },
		{ key: 'send', label: 'Send', n: 3 }
	] as const;

	const currentIndex = $derived(steps.findIndex((s) => s.key === current));
</script>

<ol class="flex items-center gap-2 sm:gap-3">
	{#each steps as step, i (step.key)}
		{@const done = i < currentIndex}
		{@const active = i === currentIndex}
		<li class="flex items-center gap-2 sm:gap-3">
			<div class="flex items-center gap-2">
				<span
					class={cn(
						'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
						done && 'bg-primary text-primary-foreground',
						active && 'bg-primary text-primary-foreground ring-4 ring-primary/15',
						!done && !active && 'bg-muted text-muted-foreground'
					)}
				>
					{#if done}
						<Check class="h-3.5 w-3.5" />
					{:else}
						{step.n}
					{/if}
				</span>
				<span
					class={cn(
						'text-sm font-medium transition-colors',
						active ? 'text-foreground' : 'text-muted-foreground'
					)}
				>
					{step.label}
				</span>
			</div>
			{#if i < steps.length - 1}
				<span class={cn('h-px w-6 sm:w-10', i < currentIndex ? 'bg-primary' : 'bg-border')}></span>
			{/if}
		</li>
	{/each}
</ol>
