<script lang="ts">
	let { current }: { current: 'customer' | 'build' | 'send' } = $props();

	const steps = [
		{ key: 'customer', label: 'Customer', n: 1 },
		{ key: 'build', label: 'Build', n: 2 },
		{ key: 'send', label: 'Send', n: 3 }
	] as const;

	const currentIndex = $derived(steps.findIndex((s) => s.key === current));
</script>

<ol class="quote-progress-strip">
	{#each steps as step, i (step.key)}
		{@const done = i < currentIndex}
		{@const active = i === currentIndex}
		<li
			class="quote-progress-strip__step{done
				? ' quote-progress-strip__step--done'
				: active
					? ' quote-progress-strip__step--active'
					: ''}"
		>
			<span class="quote-progress-strip__circle">
				{#if done}
					<i class="ri-check-line" aria-hidden="true"></i>
				{:else}
					{step.n}
				{/if}
			</span>
			<span class="quote-progress-strip__label">{step.label}</span>
		</li>
		{#if i < steps.length - 1}
			<span
				class="quote-progress-strip__connector{i < currentIndex
					? ' quote-progress-strip__connector--done'
					: ''}"
				aria-hidden="true"
			></span>
		{/if}
	{/each}
</ol>
