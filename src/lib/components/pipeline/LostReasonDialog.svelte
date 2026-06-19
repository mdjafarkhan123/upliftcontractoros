<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils/cn';
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

		<div class="space-y-4">
			<div class="space-y-2">
				<Label>Reason <span class="text-destructive">*</span></Label>
				<div class="grid grid-cols-1 gap-2">
					{#each options as option (option)}
						<button
							type="button"
							onclick={() => { selected = option; errorMsg = null; }}
							class={cn(
								'flex min-h-[44px] items-center rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
								selected === option
									? 'border-destructive bg-destructive/10 font-medium text-destructive'
									: 'border-border bg-background hover:border-destructive/40 hover:bg-muted/50'
							)}
						>
							{LOST_REASON_LABELS[option]}
						</button>
					{/each}
				</div>
				{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}
			</div>

			<div class="space-y-1.5">
				<Label for="lost-note">Additional details <span class="text-muted-foreground text-xs">(optional)</span></Label>
				<Textarea
					id="lost-note"
					bind:value={note}
					rows={3}
					maxlength={200}
					placeholder="Any extra context…"
				/>
				<p class="text-right text-xs text-muted-foreground">{note.length}/200</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" disabled={loading} onclick={cancel}>Cancel</Button>
			<JetEngineButton
				variant="destructive"
				label="Mark as lost"
				loadingLabel="Saving…"
				successLabel="Saved"
				state={loading ? 'loading' : 'idle'}
				onclick={handleConfirm}
			/>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
