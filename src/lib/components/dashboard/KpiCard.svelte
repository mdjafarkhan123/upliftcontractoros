<script lang="ts">
	type Trend = { label: string; direction: 'up' | 'down' | 'flat'; positive: boolean };

	let {
		label,
		value,
		hint,
		trend,
		iconClass,
		tone = 'default',
		featured = false,
		locked = false,
		lockedMessage,
		href,
		class: className
	}: {
		label: string;
		value: string;
		hint?: string;
		trend?: Trend;
		/** Remix icon class, e.g. "ri-user-add-line" */
		iconClass?: string;
		tone?: 'default' | 'success' | 'warning' | 'danger';
		featured?: boolean;
		locked?: boolean;
		lockedMessage?: string;
		href?: string;
		class?: string;
	} = $props();

	const trendIcon = $derived(
		trend?.direction === 'up'
			? 'ri-arrow-up-line'
			: trend?.direction === 'down'
				? 'ri-arrow-down-line'
				: 'ri-subtract-line'
	);

	const trendMod = $derived(
		featured
			? 'kpi-card__trend--featured'
			: !trend || trend.direction === 'flat'
				? 'kpi-card__trend--neutral'
				: trend.positive
					? 'kpi-card__trend--positive'
					: 'kpi-card__trend--negative'
	);

	const iconMod = $derived(
		featured
			? 'kpi-card__icon--featured'
			: tone === 'success'
				? 'kpi-card__icon--success'
				: tone === 'warning'
					? 'kpi-card__icon--warning'
					: tone === 'danger'
						? 'kpi-card__icon--danger'
						: 'kpi-card__icon--brand'
	);

	const Tag = $derived(href && !locked ? 'a' : 'div');
</script>

<svelte:element
	this={Tag}
	href={Tag === 'a' ? href : undefined}
	class={['kpi-card', featured && 'kpi-card--featured', className].filter(Boolean).join(' ')}
>
	<div class="kpi-card__top">
		<span class="kpi-card__label">{label}</span>
		{#if Tag === 'a' && !locked}
			<span class="kpi-card__action-icon">
				<i class="ri-arrow-right-up-line"></i>
			</span>
		{:else if iconClass}
			<span class={['kpi-card__icon', iconMod].join(' ')}>
				<i class={iconClass}></i>
			</span>
		{/if}
	</div>

	<div class="kpi-card__body">
		<span class="kpi-card__value">{value}</span>
		{#if trend || hint}
			<div class="kpi-card__meta-row">
				{#if trend}
					<span class={['kpi-card__trend', trendMod].join(' ')}>
						<i class={trendIcon}></i>
						{trend.label}
					</span>
				{/if}
				{#if hint}
					<span class="kpi-card__hint">{hint}</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if locked}
		<div class="kpi-card__lock">
			<i class="ri-lock-line"></i>
			<span>{lockedMessage ?? "You don't have access to this metric"}</span>
		</div>
	{/if}
</svelte:element>
