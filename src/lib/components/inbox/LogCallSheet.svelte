<script lang="ts">
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
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

	const outcomes: { value: CallOutcome; label: string; icon: string }[] = [
		{ value: 'spoke', label: 'Spoke', icon: 'ri-phone-line' },
		{ value: 'voicemail', label: 'Left voicemail', icon: 'ri-voiceprint-line' },
		{ value: 'no_answer', label: 'No answer', icon: 'ri-phone-lock-line' },
		{ value: 'follow_up_scheduled', label: 'Follow-up', icon: 'ri-calendar-event-line' },
		{ value: 'wrong_number', label: 'Wrong number', icon: 'ri-forbid-line' }
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
	<div class="log-call">
		<div class="log-call__grid">
			{#each outcomes as o (o.value)}
				<button
					type="button"
					class="log-call__outcome"
					class:log-call__outcome--active={outcome === o.value}
					onclick={() => (outcome = o.value)}
					aria-pressed={outcome === o.value}
				>
					<i class={o.icon} aria-hidden="true"></i>
					<span>{o.label}</span>
				</button>
			{/each}
		</div>

		<div class="log-call__field">
			<label for="call-duration" class="log-call__label"> Duration (minutes) </label>
			<Input
				id="call-duration"
				type="number"
				inputmode="numeric"
				min="0"
				bind:value={durationMinutes}
				placeholder="Optional"
				class="log-call__input"
			/>
		</div>

		<div class="log-call__field">
			<label for="call-note" class="log-call__label"> Note </label>
			<Textarea
				id="call-note"
				bind:value={note}
				rows={2}
				maxlength={2000}
				placeholder="Optional — what was discussed"
				class="log-call__textarea"
			/>
		</div>

		<div class="log-call__actions">
			<Button type="button" variant="ghost" loading={saving} onclick={handleDismiss}>
				Didn't call
			</Button>
			<Button type="button" loading={saving} disabled={!outcome} onclick={handleLog}>
				Log call
			</Button>
		</div>
	</div>
</BottomSheet>
