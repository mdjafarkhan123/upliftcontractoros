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

<div class="grid gap-3 sm:grid-cols-3">
	{#each PLAN_TEMPLATE_LIST as template (template.plan)}
		{@const active = value === template.plan}
		<button
			type="button"
			onclick={() => apply(template)}
			class="group flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40
				{active
				? 'border-red-500/50 bg-red-500/5 ring-1 ring-red-500/30'
				: 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/60'}"
		>
			<div class="flex w-full items-center justify-between gap-2">
				<span class="text-sm font-semibold text-white">{template.label}</span>
				{#if active}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
					>
						Applied
					</span>
				{/if}
			</div>
			<span class="text-[11px] leading-snug text-slate-400">{template.tagline}</span>
		</button>
	{/each}
</div>

<p class="mt-3 text-[11px] text-slate-500">
	Templates pre-fill flags and limits. Every value below stays manually overridable.
</p>
