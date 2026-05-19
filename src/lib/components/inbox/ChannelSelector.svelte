<script lang="ts">
	import { MessageSquare, Mail, Globe } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
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

	const meta: Record<OutboundChannel, { label: string; icon: typeof MessageSquare }> = {
		sms: { label: 'SMS', icon: MessageSquare },
		email: { label: 'Email', icon: Mail },
		webchat: { label: 'Webchat', icon: Globe }
	};

	const options = $derived(available.map((c) => ({ key: c, ...meta[c] })));
</script>

{#if options.length > 1}
	<div
		role="radiogroup"
		aria-label="Reply channel"
		class="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5"
	>
		{#each options as opt (opt.key)}
			{@const active = value === opt.key}
			<button
				type="button"
				role="radio"
				aria-checked={active}
				{disabled}
				onclick={() => onChange(opt.key)}
				class={cn(
					'inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
					active
						? 'bg-primary text-primary-foreground shadow-sm'
						: 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
					disabled && 'cursor-not-allowed opacity-60'
				)}
			>
				<opt.icon class="h-3.5 w-3.5" />
				{opt.label}
			</button>
		{/each}
	</div>
{:else if options.length === 1}
	{@const Only = options[0]}
	<div
		class="inline-flex min-h-[28px] items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground"
	>
		<Only.icon class="h-3 w-3" />
		Replying via {Only.label}
	</div>
{/if}
