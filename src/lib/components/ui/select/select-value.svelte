<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';

	let {
		placeholder = 'Select an option',
		...rest
	}: SelectPrimitive.ValueProps & { placeholder?: string } = $props();
</script>

<SelectPrimitive.Value {placeholder} {...rest} />
