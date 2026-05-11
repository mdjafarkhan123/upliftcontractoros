<script lang="ts">
	import { Badge as UIBadge } from '$lib/components/ui/badge';

	type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

	let {
		label,
		variant = 'default' as Variant,
		class: className
	}: { label: string; variant?: Variant; class?: string } = $props();
</script>

<UIBadge {variant} class={className}>{label}</UIBadge>
