<script lang="ts">
	import { FEATURE_FLAG_GROUPS, SMS_MASTER_GATED_FLAGS } from '$lib/admin/featureGroups';
	import type { FeatureFlags } from '$lib/types';
	import Toggle from './Toggle.svelte';

	let {
		flags = $bindable<FeatureFlags>(),
		integrationStatus = {},
		smsEnabled = true
	}: {
		flags?: FeatureFlags;
		integrationStatus?: Record<string, unknown>;
		smsEnabled?: boolean;
	} = $props();

	const stripeConnected = $derived(Boolean(integrationStatus?.stripe_connected));
	const twilioConnected = $derived(Boolean(integrationStatus?.twilio_connected));

	function integrationConnected(requires: 'stripe' | 'twilio' | undefined): boolean {
		if (requires === 'stripe') return stripeConnected;
		if (requires === 'twilio') return twilioConnected;
		return true;
	}
</script>

<div class="jafar-flags">
	{#if !smsEnabled}
		<div class="jafar-alert jafar-alert--amber" role="alert">
			SMS master switch is <strong>off</strong>. SMS features are blocked org-wide and the SMS
			toggles below are locked. Stored values are preserved and restore when you re-enable SMS.
		</div>
	{/if}

	{#each FEATURE_FLAG_GROUPS as group (group.id)}
		<div class="jafar-flag-group">
			<header class="jafar-flag-group__head">
				<h3 class="jafar-flag-group__title">{group.title}</h3>
				<p class="jafar-flag-group__sub">{group.description}</p>
			</header>

			<ul>
				{#each group.flags as flag (flag.key)}
					{@const enabled = flags[flag.key]}
					{@const connected = integrationConnected(flag.requires)}
					{@const mastered = !smsEnabled && SMS_MASTER_GATED_FLAGS.has(flag.key)}
					<li class="jafar-flag-row {mastered ? 'jafar-flag-row--mastered' : ''}">
						<div class="jafar-flag-row__info">
							<div class="jafar-flag-row__name">
								{flag.label}
								{#if flag.requires === 'stripe'}
									<span
										class="jafar-req-pill {connected
											? 'jafar-req-pill--ready'
											: 'jafar-req-pill--warn'}"
									>
										{connected ? 'Stripe ready' : 'Needs Stripe'}
									</span>
								{:else if flag.requires === 'twilio'}
									<span
										class="jafar-req-pill {connected
											? 'jafar-req-pill--ready'
											: 'jafar-req-pill--warn'}"
									>
										{connected ? 'Twilio ready' : 'Needs Twilio'}
									</span>
								{/if}
							</div>
							<p class="jafar-flag-row__desc">{flag.description}</p>
							{#if mastered}
								<p class="jafar-flag-row__warn">
									Governed by the SMS master switch (currently off). Value preserved — re-enable SMS
									to restore.
								</p>
							{:else if flag.requires && !connected && enabled}
								<p class="jafar-flag-row__warn">
									Flag is on, but the {flag.requires} integration is not connected yet. Tenant cannot
									use this feature until they connect.
								</p>
							{/if}
						</div>

						<Toggle bind:checked={flags[flag.key]} ariaLabel={flag.label} disabled={mastered} />
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>

<style lang="scss">
	.jafar-flags {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
</style>
