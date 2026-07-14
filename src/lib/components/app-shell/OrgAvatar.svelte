<script lang="ts">
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

	const showImage = $derived(Boolean(logoUrl) && !failed);
	const isLoading = $derived(showImage && !loaded);
</script>

<div
	class={['org-avatar', `org-avatar--${size}`, className].filter(Boolean).join(' ')}
	aria-hidden="true"
>
	<div class="org-avatar__fallback{showImage ? ' org-avatar__fallback--image' : ''}">
		{#if isLoading}
			<span class="org-avatar__loading skeleton-shimmer"></span>
		{:else if !showImage}
			<span>{initials}</span>
		{/if}
	</div>

	{#if showImage}
		<img
			src={logoUrl}
			alt=""
			class="org-avatar__img{loaded ? ' org-avatar__img--loaded' : ''}"
			onload={() => (loaded = true)}
			onerror={() => {
				failed = true;
				loaded = false;
			}}
		/>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.org-avatar {
		position: relative;
		flex-shrink: 0;
		overflow: hidden;
		border-radius: $radius-sm;

		&--sm {
			width: 24px;
			height: 24px;
			font-size: 10px;
		}
		&--md {
			width: 32px;
			height: 32px;
			font-size: 12px;
		}
		&--lg {
			width: 48px;
			height: 48px;
			font-size: 14px;
		}

		&__fallback {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: $weight-semibold;
			background: var(--color-brand);
			color: var(--color-text-on-brand);

			// When a logo image is present, the fallback sits behind it as a neutral backdrop.
			&--image {
				background: var(--color-bg-surface-sunk);
				color: var(--color-text-muted);
			}
		}

		&__loading {
			display: block;
			width: 100%;
			height: 100%;
		}

		&__img {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
			opacity: 0;
			transition: opacity $duration-fast $ease-standard;

			&--loaded {
				opacity: 1;
			}
		}
	}
</style>
