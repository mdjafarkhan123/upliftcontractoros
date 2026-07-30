<script lang="ts">
	import Avatar from '$lib/components/shared/Avatar.svelte';

	type Size = 'xs' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | '2xl';

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
		size?: number;
		fill?: boolean;
	} = $props();

	const palette = $derived(
		status === 'customer' ? 'teal' : status === 'archived' ? 'amber' : 'brand'
	);

	const tone = $derived(
		status === 'customer' ? 'customer' : status === 'archived' ? 'archived' : 'lead'
	);

	const namedSize = $derived.by<Size>(() => {
		if (fill) return 'md';
		const map: Record<number, Size> = {
			18: 'xs',
			24: 'sm',
			32: 'base',
			40: 'md',
			44: 'lg',
			56: 'xl',
			64: '2xl'
		};
		return map[size] ?? 'md';
	});
</script>

<div
	class="contact-avatar-wrap contact-avatar-wrap--{tone}"
	class:contact-avatar-wrap--fill={fill}
>
	<Avatar {name} {src} size={namedSize} palette={palette} />
</div>
