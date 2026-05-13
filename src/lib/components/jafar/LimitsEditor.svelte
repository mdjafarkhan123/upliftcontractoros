<script lang="ts">
	import { LIMIT_DEFS } from '$lib/admin/featureGroups';
	import type { OrgLimits } from '$lib/types';

	let {
		limits = $bindable<OrgLimits>()
	}: {
		limits?: OrgLimits;
	} = $props();

	function handleInput(key: keyof OrgLimits, e: Event) {
		const raw = (e.currentTarget as HTMLInputElement).value;
		const num = raw === '' ? 0 : Math.max(0, Math.min(1_000_000, Math.floor(Number(raw))));
		if (Number.isFinite(num)) {
			limits[key] = num;
		}
	}
</script>

<div class="grid gap-4 sm:grid-cols-2">
	{#each LIMIT_DEFS as def (def.key)}
		{@const value = limits[def.key]}
		{@const isZero = value === 0}
		<div class="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<label for={`limit-${def.key}`} class="text-sm font-medium text-white">
						{def.label}
					</label>
					<p class="mt-0.5 text-[11px] leading-snug text-slate-500">{def.description}</p>
				</div>
				<span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
					{def.unit}
				</span>
			</div>

			<div class="mt-3 flex items-center gap-2">
				<input
					id={`limit-${def.key}`}
					type="number"
					min="0"
					max="1000000"
					step="1"
					inputmode="numeric"
					value={value}
					oninput={(e) => handleInput(def.key, e)}
					class="block w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/30 transition-colors"
				/>
			</div>

			<p class="mt-1.5 text-[11px] text-slate-500">
				{#if isZero}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-slate-400"
					>
						0 = {def.zeroMeans}
					</span>
				{:else}
					Tenant capped at {value.toLocaleString()} {def.unit}.
				{/if}
			</p>
		</div>
	{/each}
</div>
