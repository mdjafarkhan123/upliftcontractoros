<script lang="ts">
	type Size = 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl';
	type Palette = 'brand' | 'sky' | 'purple' | 'orange' | 'teal' | 'pink' | 'indigo' | 'amber';

	let {
		name,
		src = null,
		size = 'md' as Size,
		variant = 'circle' as 'circle' | 'square',
		bordered = false,
		online = null as boolean | null,
		palette = 'brand' as Palette,
		class: className = ''
	}: {
		name: string;
		src?: string | null;
		size?: Size;
		variant?: 'circle' | 'square';
		bordered?: boolean;
		online?: boolean | null;
		palette?: Palette;
		class?: string;
	} = $props();

	let loaded = $state(false);
	let failed = $state(false);
	let trackedSrc = $state<string | null>(null);

	$effect(() => {
		if (src !== trackedSrc) {
			trackedSrc = src;
			loaded = false;
			failed = false;
		}
	});

	const initials = $derived(
		name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('')
	);

	const showImage = $derived(Boolean(src) && !failed);
	const isLoading = $derived(showImage && !loaded);

	const sizeMap: Record<Size, number> = {
		xs: 18,
		sm: 24,
		base: 32,
		md: 40,
		lg: 44,
		xl: 56,
		'2xl': 64
	};

	const fallbackFontSize = $derived(`${Math.round(sizeMap[size] * 0.35)}px`);

	const classes = $derived(
		[
			'avatar',
			`avatar--${size}`,
			variant === 'square' ? 'avatar--square' : '',
			bordered ? 'avatar--bordered' : '',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div class={classes}>
	{#if showImage}
		{#if isLoading}
			<div class="avatar__fallback" data-palette={palette} style:font-size={fallbackFontSize}>
				<span class="skeleton-shimmer" style="display:block;width:100%;height:100%"></span>
			</div>
		{/if}
		<img
			class="avatar__img"
			class:avatar__img--loaded={loaded}
			src={src!}
			alt={name}
			style:display={isLoading ? 'none' : undefined}
			onload={() => (loaded = true)}
			onerror={() => {
				failed = true;
				loaded = false;
			}}
			loading="lazy"
		/>
	{:else}
		<div class="avatar__fallback" data-palette={palette} style:font-size={fallbackFontSize}>
			{initials || '?'}
		</div>
	{/if}

	{#if online !== null}
		<span
			class="avatar-indicator"
			class:avatar-indicator--offline={!online}
			aria-label={online ? 'Online' : 'Offline'}
		></span>
	{/if}
</div>
