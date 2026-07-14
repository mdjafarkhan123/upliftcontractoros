<script lang="ts">
	import { PLAN_TEMPLATE_LIST, type PlanName, type PlanTemplate } from '$lib/admin/planTemplates';

	let {
		value = $bindable<PlanName>('starter'),
		onApply
	}: {
		value?: PlanName;
		onApply: (template: PlanTemplate) => void;
	} = $props();

	function apply(template: PlanTemplate) {
		value = template.plan;
		onApply(template);
	}
</script>

<div class="plan-grid">
	{#each PLAN_TEMPLATE_LIST as template (template.plan)}
		{@const active = value === template.plan}
		<button
			type="button"
			onclick={() => apply(template)}
			class="jafar-plan-chip {active ? 'jafar-plan-chip--active' : ''}"
		>
			<div class="jafar-plan-chip__header">
				<span class="jafar-plan-chip__name">{template.label}</span>
				{#if active}
					<span class="jafar-plan-chip__applied">Applied</span>
				{/if}
			</div>
			<span class="jafar-plan-chip__tagline">{template.tagline}</span>
		</button>
	{/each}
</div>

<p class="plan-note">Templates pre-fill flags and limits. Every value below stays manually overridable.</p>

<style lang="scss">
	.plan-grid {
		display: grid;
		gap: 0.75rem;
		@media (min-width: 640px) {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.plan-note {
		margin-top: 0.75rem;
		font-size: 0.6875rem;
		color: #64748b;
	}
</style>
