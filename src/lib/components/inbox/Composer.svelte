<script lang="ts">
	import { Send, StickyNote } from '@lucide/svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils/cn';

	let {
		disabled = false,
		disabledReason,
		canSend = true,
		onSend
	}: {
		disabled?: boolean;
		disabledReason?: string;
		canSend?: boolean;
		onSend: (body: string, isInternalNote: boolean) => Promise<void> | void;
	} = $props();

	let body = $state('');
	let isInternalNote = $state(false);
	let sending = $state(false);

	const trimmed = $derived(body.trim());
	const submitDisabled = $derived(
		sending || trimmed.length === 0 || (disabled && !isInternalNote) || !canSend
	);

	async function submit() {
		if (submitDisabled) return;
		sending = true;
		try {
			await onSend(trimmed, isInternalNote);
			body = '';
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
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
	class="space-y-2"
>
	<div class="flex items-center gap-3">
		<label
			class={cn(
				'inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
				isInternalNote
					? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
					: 'border-border bg-card text-muted-foreground hover:bg-accent/40'
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
		{#if disabled && !isInternalNote && disabledReason}
			<span class="truncate text-xs text-destructive">{disabledReason}</span>
		{/if}
	</div>

	<div
		class={cn(
			'flex items-end gap-2 rounded-xl border bg-card p-2 transition-colors focus-within:border-primary/50',
			isInternalNote ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'
		)}
	>
		<Textarea
			bind:value={body}
			onkeydown={handleKey}
			placeholder={isInternalNote
				? 'Private note — only visible to your team'
				: disabled
					? disabledReason ?? 'Messaging disabled'
					: 'Type a message…'}
			rows={1}
			disabled={(disabled && !isInternalNote) || sending || !canSend}
			class="min-h-[44px] resize-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0"
		/>
		<button
			type="submit"
			disabled={submitDisabled}
			class={cn(
				'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-all',
				'bg-primary hover:bg-primary/90 active:scale-95',
				'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
			)}
			aria-label="Send message"
		>
			<Send class="h-4 w-4" />
		</button>
	</div>
</form>
