<script lang="ts">
	import { FEATURE_FLAG_GROUPS } from '$lib/admin/featureGroups';
	import type { FeatureFlags } from '$lib/types';
	import Toggle from './Toggle.svelte';

	let {
		flags = $bindable<FeatureFlags>(),
		integrationStatus = {}
	}: {
		flags?: FeatureFlags;
		integrationStatus?: Record<string, unknown>;
	} = $props();

	const stripeConnected = $derived(Boolean(integrationStatus?.stripe_connected));
	const twilioConnected = $derived(Boolean(integrationStatus?.twilio_connected));

	function integrationConnected(requires: 'stripe' | 'twilio' | undefined): boolean {
		if (requires === 'stripe') return stripeConnected;
		if (requires === 'twilio') return twilioConnected;
		return true;
	}
</script>

<div class="space-y-5">
	{#each FEATURE_FLAG_GROUPS as group (group.id)}
		<div class="rounded-xl border border-slate-800 bg-slate-950/40">
			<header class="border-b border-slate-800/80 px-4 py-3">
				<h3 class="text-sm font-semibold text-white">{group.title}</h3>
				<p class="mt-0.5 text-[11px] text-slate-500">{group.description}</p>
			</header>

			<ul class="divide-y divide-slate-800/60">
				{#each group.flags as flag (flag.key)}
					{@const enabled = flags[flag.key]}
					{@const connected = integrationConnected(flag.requires)}
					<li class="flex items-start justify-between gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-medium text-white">{flag.label}</span>
								{#if flag.requires === 'stripe'}
									<span
										class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide
											{connected
											? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
											: 'border-amber-500/30 bg-amber-500/10 text-amber-300'}"
									>
										{connected ? 'Stripe ready' : 'Needs Stripe'}
									</span>
								{:else if flag.requires === 'twilio'}
									<span
										class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide
											{connected
											? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
											: 'border-amber-500/30 bg-amber-500/10 text-amber-300'}"
									>
										{connected ? 'Twilio ready' : 'Needs Twilio'}
									</span>
								{/if}
							</div>
							<p class="mt-0.5 text-[11px] leading-snug text-slate-500">{flag.description}</p>
							{#if flag.requires && !connected && enabled}
								<p class="mt-1 text-[11px] text-amber-300/90">
									Flag is on, but the {flag.requires} integration is not connected yet. Tenant cannot
									use this feature until they connect.
								</p>
							{/if}
						</div>

						<Toggle bind:checked={flags[flag.key]} ariaLabel={flag.label} />
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
