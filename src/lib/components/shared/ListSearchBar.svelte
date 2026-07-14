<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = 'Search',
		onInput
	}: {
		value?: string;
		placeholder?: string;
		onInput?: (v: string) => void;
	} = $props();

	let timer: ReturnType<typeof setTimeout> | null = null;
	function handle(e: Event) {
		const next = (e.target as HTMLInputElement).value;
		value = next;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => onInput?.(next.trim()), 250);
	}
</script>

<div class="list-search">
	<i class="ri-search-line list-search__icon" aria-hidden="true"></i>
	<input
		class="list-search__input"
		type="search"
		inputmode="search"
		{placeholder}
		{value}
		oninput={handle}
	/>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.list-search {
		position: relative;

		&__icon {
			position: absolute;
			left: $space-3;
			top: 50%;
			transform: translateY(-50%);
			pointer-events: none;
			color: var(--color-text-muted);
			font-size: 1.5rem;
		}

		&__input {
			width: 100%;
			height: 40px;
			padding: 0 $space-3 0 calc(#{$space-3} + 1.5rem + #{$space-2});
			border: 1px solid var(--color-border-strong);
			border-radius: $radius-md;
			background: var(--color-bg-surface);
			color: var(--color-text-primary);
			font: inherit;
			font-size: $fs-body;
			transition: border-color $duration-fast $ease-standard, box-shadow $duration-fast $ease-standard;

			&::placeholder { color: var(--color-text-muted); }
			&:focus { outline: none; border-color: var(--color-brand); box-shadow: var(--shadow-focus); }
		}
	}
</style>
