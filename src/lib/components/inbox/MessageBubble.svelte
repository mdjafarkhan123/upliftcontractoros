<script lang="ts">
	import { PhoneMissed, Check, AlertCircle, Loader2, StickyNote } from '@lucide/svelte';
	import type { ThreadMessage } from '$lib/stores/inbox.svelte';
	import { cn } from '$lib/utils/cn';

	let { message: m }: { message: ThreadMessage } = $props();

	const isMissedCall = $derived(m.channel === 'missed_call');
	const isInbound = $derived(m.direction === 'inbound');
	const isInternal = $derived(m.is_internal_note);

	const timestamp = $derived(
		m.created_at
			? new Date(m.created_at).toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);
</script>

{#if isMissedCall}
	<div class="flex justify-center">
		<div
			class="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
		>
			<PhoneMissed class="h-3.5 w-3.5" />
			<span>Missed call · {timestamp}</span>
		</div>
	</div>
{:else if isInternal}
	<div class="flex justify-center px-2">
		<div
			class="max-w-[85%] rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
		>
			<div class="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
				<StickyNote class="h-3 w-3" />
				Internal note
			</div>
			<p class="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
			<div class="mt-1 text-right text-[10px] text-muted-foreground">{timestamp}</div>
		</div>
	</div>
{:else}
	<div class={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
		<div
			class={cn(
				'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm transition-colors',
				isInbound
					? 'rounded-bl-md bg-card text-foreground'
					: 'rounded-br-md bg-primary text-primary-foreground',
				m.status === 'sending' && 'opacity-70',
				m.status === 'failed' && 'border border-destructive/40'
			)}
		>
			<p class="whitespace-pre-wrap break-words">{m.body}</p>
			<div
				class={cn(
					'mt-1 flex items-center justify-end gap-1 text-[10px]',
					isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70'
				)}
			>
				<span>{timestamp}</span>
				{#if !isInbound}
					{#if m.status === 'sending'}
						<Loader2 class="h-3 w-3 animate-spin" />
					{:else if m.status === 'failed'}
						<AlertCircle class="h-3 w-3 text-destructive" />
					{:else}
						<Check class="h-3 w-3" />
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}
