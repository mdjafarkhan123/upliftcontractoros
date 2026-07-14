<script lang="ts">
	let {
		name,
		src = null,
		status = null,
		size = 40,
		fill = false
	}: {
		name: string;
		src?: string | null;
		status?: 'lead' | 'customer' | 'archived' | null;
		/** Diameter in px. Ignored when `fill` is set. */
		size?: number;
		/** Fill the parent element instead of using a fixed `size`. */
		fill?: boolean;
	} = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('')
	);

	const tone = $derived(
		status === 'customer' ? 'customer' : status === 'archived' ? 'archived' : 'lead'
	);

	// Font scales with diameter (~40% of size) so initials stay proportional.
	const dims = $derived(
		fill
			? { width: '100%', height: '100%', 'font-size': '40%' }
			: { width: `${size}px`, height: `${size}px`, 'font-size': `${Math.round(size * 0.4)}px` }
	);
</script>

{#if src}
	<img
		{src}
		alt={name}
		class="contact-avatar contact-avatar--img"
		style:width={dims.width}
		style:height={dims.height}
		loading="lazy"
	/>
{:else}
	<div
		class="contact-avatar contact-avatar--{tone}"
		style:width={dims.width}
		style:height={dims.height}
		style:font-size={dims['font-size']}
	>
		{initials || '?'}
	</div>
{/if}
