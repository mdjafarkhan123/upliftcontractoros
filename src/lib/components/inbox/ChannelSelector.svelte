<script lang="ts">
	import type { OutboundChannel } from '$lib/stores/inbox.svelte';

	let {
		value,
		available,
		disabled = false,
		onChange
	}: {
		value: OutboundChannel;
		available: OutboundChannel[];
		disabled?: boolean;
		onChange: (channel: OutboundChannel) => void;
	} = $props();

	const meta: Record<OutboundChannel, { label: string; icon: string }> = {
		sms: { label: 'SMS', icon: 'ri-message-2-line' },
		email: { label: 'Email', icon: 'ri-mail-line' },
		webchat: { label: 'Webchat', icon: 'ri-global-line' },
		messenger: { label: 'Messenger', icon: 'ri-send-plane-line' }
	};

	const options = $derived(available.map((c) => ({ key: c, ...meta[c] })));
</script>

{#if options.length > 1}
	<div class="channel-picker" role="radiogroup" aria-label="Reply channel">
		{#each options as opt (opt.key)}
			{@const active = value === opt.key}
			<button
				type="button"
				role="radio"
				aria-checked={active}
				{disabled}
				onclick={() => onChange(opt.key)}
				class="channel-picker__opt"
				class:channel-picker__opt--active={active}
			>
				<i class={opt.icon} aria-hidden="true"></i>
				{opt.label}
			</button>
		{/each}
	</div>
{:else if options.length === 1}
	{@const Only = options[0]}
	<div class="channel-picker__solo">
		<i class={Only.icon} aria-hidden="true"></i>
		Replying via {Only.label}
	</div>
{/if}
