<script lang="ts">
	type Variant = 'default' | 'destructive' | 'success';

	let {
		class: className = '',
		variant = 'default' as Variant,
		children
	}: { class?: string; variant?: Variant; children?: import('svelte').Snippet } = $props();

	const variantModifier: Record<Variant, string> = {
		default: '',
		destructive: 'ui-alert--destructive',
		success: 'ui-alert--success'
	};

	const classes = $derived(
		['ui-alert', variantModifier[variant], className].filter(Boolean).join(' ')
	);
</script>

<div role="alert" class={classes}>
	{@render children?.()}
</div>
