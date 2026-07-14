<script lang="ts">
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

<div class="contact-search">
	<i class="ri-search-line contact-search__icon" aria-hidden="true"></i>
	<input
		class="contact-search__input"
		type="search"
		inputmode="search"
		placeholder="Search name, phone, or email"
		{value}
		oninput={handle}
	/>
</div>
