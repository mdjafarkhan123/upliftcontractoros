<script lang="ts">
	import { PhoneOutgoing, Voicemail, PhoneOff, CalendarPlus, Loader2 } from '@lucide/svelte';
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils/cn';
	import type { CallOutcome } from '$lib/stores/inbox.svelte';

	let {
		open = $bindable(false),
		contactName = '',
		prefillSeconds = 0,
		onLog,
		onDismiss
	}: {
		open?: boolean;
		contactName?: string;
		prefillSeconds?: number;
		onLog: (data: {
			outcome: CallOutcome;
			durationSeconds: number | null;
			body: string;
		}) => Promise<void> | void;
		onDismiss: () => void;
	} = $props();

	const outcomes: { value: CallOutcome; label: string; icon: typeof PhoneOutgoing }[] = [
		{ value: 'spoke', label: 'Spoke', icon: PhoneOutgoing },
		{ value: 'voicemail', label: 'Left voicemail', icon: Voicemail },
		{ value: 'no_answer', label: 'No answer', icon: PhoneOff },
		{ value: 'follow_up_scheduled', label: 'Follow-up', icon: CalendarPlus }
	];

	let outcome = $state<CallOutcome | null>(null);
	let durationMinutes = $state('');
	let note = $state('');
	let saving = $state(false);

	// Reset the form each time the sheet opens; prefill the duration from the
	// measured time-away (a reasonable proxy for the call length the contractor
	// can adjust or clear).
	$effect(() => {
		if (open) {
			outcome = null;
			note = '';
			saving = false;
			durationMinutes =
				prefillSeconds > 0 ? String(Math.max(1, Math.round(prefillSeconds / 60))) : '';
		}
	});

	async function handleLog() {
		if (!outcome || saving) return;
		saving = true;
		const mins = Number(durationMinutes);
		const durationSeconds = Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : null;
		await onLog({ outcome, durationSeconds, body: note });
		open = false;
	}

	function handleDismiss() {
		open = false;
		onDismiss();
	}
</script>

<BottomSheet
	bind:open
	title="Log this call?"
	description={contactName ? `Add the call with ${contactName} to the timeline.` : undefined}
>
	<div class="space-y-4 pt-2">
		<div class="grid grid-cols-2 gap-2">
			{#each outcomes as o (o.value)}
				<button
					type="button"
					onclick={() => (outcome = o.value)}
					class={cn(
						'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						outcome === o.value
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border bg-background text-foreground hover:bg-muted'
					)}
					aria-pressed={outcome === o.value}
				>
					<o.icon class="h-4 w-4 shrink-0" />
					<span class="truncate">{o.label}</span>
				</button>
			{/each}
		</div>

		<div>
			<label for="call-duration" class="mb-1 block text-xs font-medium text-muted-foreground">
				Duration (minutes)
			</label>
			<input
				id="call-duration"
				type="number"
				inputmode="numeric"
				min="0"
				bind:value={durationMinutes}
				placeholder="Optional"
				class="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>

		<div>
			<label for="call-note" class="mb-1 block text-xs font-medium text-muted-foreground">
				Note
			</label>
			<textarea
				id="call-note"
				bind:value={note}
				rows="2"
				maxlength="2000"
				placeholder="Optional — what was discussed"
				class="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
		</div>

		<div class="flex items-center gap-2 pt-1">
			<Button variant="ghost" class="flex-1" onclick={handleDismiss} disabled={saving}>
				Didn't call
			</Button>
			<Button class="flex-1" onclick={handleLog} disabled={!outcome || saving}>
				{#if saving}
					<Loader2 class="mr-1.5 h-4 w-4 animate-spin" />
					Logging…
				{:else}
					Log call
				{/if}
			</Button>
		</div>
	</div>
</BottomSheet>
