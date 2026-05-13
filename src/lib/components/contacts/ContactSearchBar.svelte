<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Search } from '@lucide/svelte';

	let {
		value = $bindable(''),
		onInput
	}: {
		value?: string;
		onInput?: (v: string) => void;
	} = $props();

	let timer: ReturnType<typeof setTimeout> | null = null;
	function handle(e: Event) {
		const next = (e.target as HTMLInputElement).value;
		value = next;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => onInput?.(next), 250);
	}
</script>

<div class="relative">
	<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
	<Input
		type="search"
		inputmode="search"
		placeholder="Search name, phone, or email"
		class="pl-10"
		value={value}
		oninput={handle}
	/>
</div>
