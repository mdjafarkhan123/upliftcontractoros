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

<div class="limits-grid">
	{#each LIMIT_DEFS as def (def.key)}
		{@const value = limits[def.key]}
		{@const isZero = value === 0}
		<div class="jafar-limit-card">
			<div class="jafar-limit-card__header">
				<div>
					<label for={`limit-${def.key}`} class="jafar-limit-card__label">{def.label}</label>
					<p class="jafar-limit-card__desc">{def.description}</p>
				</div>
				<span class="jafar-limit-card__unit">{def.unit}</span>
			</div>

			<div class="jafar-limit-card__input-row">
				<input
					id={`limit-${def.key}`}
					type="number"
					min="0"
					max="1000000"
					step="1"
					inputmode="numeric"
					{value}
					oninput={(e) => handleInput(def.key, e)}
					class="jafar-input jafar-input--mono"
				/>
			</div>

			<p class="jafar-limit-card__hint">
				{#if isZero}
					<span class="jafar-limit-card__zero-pill">0 = {def.zeroMeans}</span>
				{:else}
					Tenant capped at {value.toLocaleString()} {def.unit}.
				{/if}
			</p>
		</div>
	{/each}
</div>

<style lang="scss">
	.limits-grid {
		display: grid;
		gap: 1rem;
		@media (min-width: 640px) {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
