<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let {
		name,
		src = null,
		status = null,
		class: className
	}: {
		name: string;
		src?: string | null;
		status?: 'lead' | 'customer' | 'archived' | null;
		/** Sizing/ring utilities, e.g. "h-16 w-16 text-xl ring-2". */
		class?: string;
	} = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('')
	);

	// Status-tinted bg/text/ring — mirrors the contact status palette.
	const tone = $derived(
		status === 'customer'
			? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400 dark:ring-emerald-500/30'
			: status === 'archived'
				? 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400'
				: 'bg-primary/10 text-primary ring-primary/20'
	);
</script>

{#if src}
	<img
		{src}
		alt={name}
		class={cn('shrink-0 rounded-full object-cover ring-border', className)}
		loading="lazy"
	/>
{:else}
	<div
		class={cn(
			'flex shrink-0 items-center justify-center rounded-full font-semibold',
			tone,
			className
		)}
	>
		{initials || '?'}
	</div>
{/if}
