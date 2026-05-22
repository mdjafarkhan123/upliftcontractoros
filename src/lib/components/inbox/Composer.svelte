<script lang="ts">
	import { Send, StickyNote } from '@lucide/svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Input } from '$lib/components/ui/input';
	import ChannelSelector from './ChannelSelector.svelte';
	import { cn } from '$lib/utils/cn';
	import type { OutboundChannel } from '$lib/stores/inbox.svelte';

	let {
		availableChannels,
		suggestedChannel,
		emailSubjectDefault = '',
		canSend = true,
		smsOptOut = false,
		isClosed = false,
		onSend
	}: {
		availableChannels: OutboundChannel[];
		suggestedChannel: OutboundChannel | null;
		emailSubjectDefault?: string;
		canSend?: boolean;
		smsOptOut?: boolean;
		isClosed?: boolean;
		onSend: (
			body: string,
			opts: { isInternalNote: boolean; channel?: OutboundChannel; emailSubject?: string }
		) => Promise<void> | void;
	} = $props();

	let body = $state('');
	let emailSubjectInput = $state<string | null>(null);
	let isInternalNote = $state(false);
	let sending = $state(false);
	let channelOverride = $state<OutboundChannel | null>(null);

	const channel = $derived<OutboundChannel>(
		channelOverride && availableChannels.includes(channelOverride)
			? channelOverride
			: suggestedChannel && availableChannels.includes(suggestedChannel)
				? suggestedChannel
				: (availableChannels[0] ?? 'sms')
	);

	const emailSubject = $derived(emailSubjectInput ?? emailSubjectDefault);

	const channelBlocked = $derived.by(() => {
		if (isInternalNote) return null;
		if (isClosed) return 'Reopen this conversation to send a message.';
		if (channel === 'sms' && smsOptOut) return 'Contact has opted out of SMS.';
		if (availableChannels.length === 0) return 'No channels available for this contact.';
		return null;
	});

	const trimmed = $derived(body.trim());
	const trimmedSubject = $derived(emailSubject.trim());
	const subjectRequired = $derived(
		!isInternalNote && channel === 'email' && !emailSubjectDefault
	);
	const submitDisabled = $derived(
		sending ||
			trimmed.length === 0 ||
			(channelBlocked !== null && !isInternalNote) ||
			!canSend ||
			(subjectRequired && trimmedSubject.length === 0)
	);

	async function submit() {
		if (submitDisabled) return;
		sending = true;
		try {
			await onSend(trimmed, {
				isInternalNote,
				channel: isInternalNote ? undefined : channel,
				emailSubject:
					!isInternalNote && channel === 'email'
						? trimmedSubject || emailSubjectDefault
						: undefined
			});
			body = '';
			emailSubjectInput = null;
			isInternalNote = false;
		} finally {
			sending = false;
		}
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void submit();
		}
	}

	const showSubjectInput = $derived(!isInternalNote && channel === 'email');
	const composerBorderClass = $derived(
		isInternalNote
			? 'border-amber-500/30 bg-amber-500/5'
			: channel === 'email'
				? 'border-blue-500/30'
				: 'border-border'
	);
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
	class="space-y-2.5"
>
	<div class="flex flex-wrap items-center gap-2">
		<label
			class={cn(
				'inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
				isInternalNote
					? 'border-amber-500/40 bg-amber-500/10 text-amber-700 shadow-sm dark:text-amber-400'
					: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
		>
			<input
				type="checkbox"
				class="sr-only"
				bind:checked={isInternalNote}
				disabled={sending}
			/>
			<StickyNote class="h-3.5 w-3.5" />
			Internal note
		</label>

		{#if !isInternalNote && availableChannels.length > 0}
			<ChannelSelector
				value={channel}
				available={availableChannels}
				disabled={sending}
				onChange={(c) => (channelOverride = c)}
			/>
		{/if}

		{#if channelBlocked && !isInternalNote}
			<span class="truncate text-xs text-destructive">{channelBlocked}</span>
		{/if}
	</div>

	{#if showSubjectInput}
		<Input
			type="text"
			value={emailSubject}
			oninput={(e) => (emailSubjectInput = (e.currentTarget as HTMLInputElement).value)}
			placeholder={subjectRequired ? 'Subject (required)' : 'Subject'}
			disabled={sending || !canSend || channelBlocked !== null}
			class="h-10 rounded-lg border-border/60 bg-background text-sm shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
		/>
	{/if}

	<div
		class={cn(
			'flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-card transition-all duration-150 focus-within:border-primary/50 focus-within:shadow-dropdown',
			composerBorderClass
		)}
	>
		<Textarea
			bind:value={body}
			onkeydown={handleKey}
			placeholder={isInternalNote
				? 'Private note — only visible to your team'
				: channelBlocked
					? channelBlocked
					: channel === 'email'
						? 'Write your email…'
						: 'Type a message…'}
			rows={1}
			disabled={(channelBlocked !== null && !isInternalNote) || sending || !canSend}
			class="min-h-[48px] resize-none border-0 bg-transparent p-2.5 text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
		/>
		<button
			type="submit"
			disabled={submitDisabled}
			class={cn(
				'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-sm transition-all',
				'bg-gradient-to-b from-primary to-[hsl(var(--primary-deep))] hover:shadow-[0_8px_22px_-10px_hsl(var(--primary)/0.9)] active:scale-95',
				'disabled:cursor-not-allowed disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none disabled:active:scale-100',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
			)}
			aria-label="Send message"
		>
			<Send class="h-4 w-4" />
		</button>
	</div>
</form>
