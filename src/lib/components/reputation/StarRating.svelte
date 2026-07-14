<script lang="ts">
	let {
		score,
		size = 'sm',
		class: className = ''
	}: {
		score: number;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	} = $props();
</script>

<div class="star-rating star-rating--{size} {className}" aria-label={`${score} out of 5 stars`}>
	{#each [1, 2, 3, 4, 5] as i (i)}
		<i class="ri-star-fill {i <= score ? 'is-filled' : ''}" aria-hidden="true"></i>
	{/each}
</div>
