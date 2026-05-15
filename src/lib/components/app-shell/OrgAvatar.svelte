<script lang="ts">
	import { cn } from '$lib/utils/cn';

	let {
		name,
		logoUrl,
		size = 'md',
		class: className = ''
	}: {
		name: string;
		logoUrl: string | null;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	} = $props();

	let loaded = $state(false);
	let failed = $state(false);
	let trackedUrl = $state<string | null>(null);

	// Reset state only when the logoUrl actually changes (prevents flicker on re-render with the same URL)
	$effect(() => {
		if (logoUrl !== trackedUrl) {
			trackedUrl = logoUrl;
			loaded = false;
			failed = false;
		}
	});

	const initials = $derived(
		name
			.split(' ')
			.map((n) => n[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || 'C'
	);

	const sizeClass = $derived(
		size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-sm' : 'h-8 w-8 text-xs'
	);

	const showImage = $derived(Boolean(logoUrl) && !failed);
	const isLoading = $derived(showImage && !loaded);
</script>

<div
	class={cn(
		'relative shrink-0 overflow-hidden rounded-md',
		sizeClass,
		className
	)}
	aria-hidden="true"
>
	<div
		class={cn(
			'absolute inset-0 flex items-center justify-center font-semibold',
			showImage
				? 'bg-muted text-muted-foreground'
				: 'bg-primary text-primary-foreground'
		)}
	>
		{#if isLoading}
			<span class="block h-full w-full animate-pulse bg-muted"></span>
		{:else if !showImage}
			<span>{initials}</span>
		{/if}
	</div>

	{#if showImage}
		<img
			src={logoUrl}
			alt=""
			class={cn(
				'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
				loaded ? 'opacity-100' : 'opacity-0'
			)}
			onload={() => (loaded = true)}
			onerror={() => {
				failed = true;
				loaded = false;
			}}
		/>
	{/if}
</div>
