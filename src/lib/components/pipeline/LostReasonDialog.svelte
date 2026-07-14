<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import type { LostReason } from '$lib/types/pipeline';
	import { LOST_REASON_LABELS } from '$lib/types/pipeline';

	type Props = {
		open: boolean;
		onCancel: () => void;
		onConfirm: (reason: LostReason, note?: string) => void | Promise<void>;
		loading?: boolean;
	};

	let { open = $bindable(), onCancel, onConfirm, loading = false }: Props = $props();

	const options: LostReason[] = ['price', 'competitor', 'timing', 'no_response', 'other'];

	let selected = $state<LostReason | null>(null);
	let note = $state('');
	let errorMsg = $state<string | null>(null);

	async function handleConfirm() {
		if (!selected) {
			errorMsg = 'Please select a reason.';
			return;
		}
		errorMsg = null;
		await onConfirm(selected, note.trim() || undefined);
		reset();
	}

	function reset() {
		selected = null;
		note = '';
		errorMsg = null;
	}

	function cancel() {
		reset();
		onCancel();
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && cancel()}>
	<Dialog.Content showClose={false}>
		<Dialog.Header>
			<Dialog.Title>Mark as lost</Dialog.Title>
			<Dialog.Description>Why didn't this deal close?</Dialog.Description>
		</Dialog.Header>

		<div style="display:flex; flex-direction:column; gap:16px;">
			<div>
				<Label>Reason <span style="color:var(--danger-solid)">*</span></Label>
				<div class="lost-reason__options" style="margin-top:8px;">
					{#each options as option (option)}
						<button
							type="button"
							onclick={() => { selected = option; errorMsg = null; }}
							class="lost-reason__option-btn{selected === option ? ' lost-reason__option-btn--selected' : ''}"
						>
							{LOST_REASON_LABELS[option]}
						</button>
					{/each}
				</div>
				{#if errorMsg}
					<p style="font-size:var(--text-body); color:var(--danger-solid); margin-top:6px;">{errorMsg}</p>
				{/if}
			</div>

			<div>
				<Label for="lost-note">
					Additional details
					<span style="color:var(--color-text-muted); font-size:12px;">(optional)</span>
				</Label>
				<Textarea
					id="lost-note"
					bind:value={note}
					rows={3}
					maxlength={200}
					placeholder="Any extra context…"
					style="margin-top:6px;"
				/>
				<p style="text-align:right; font-size:12px; color:var(--color-text-muted); margin-top:4px;">
					{note.length}/200
				</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" disabled={loading} onclick={cancel}>Cancel</Button>
			<Button
				variant="destructive"
				loadingLabel="Saving…"
				successLabel="Saved"
				loading={loading}
				onclick={handleConfirm}
			>
				Mark as lost
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
