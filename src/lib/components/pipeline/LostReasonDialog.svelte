<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';

	type Props = {
		open: boolean;
		onCancel: () => void;
		onConfirm: (reason: string) => void | Promise<void>;
		loading?: boolean;
	};

	let { open = $bindable(), onCancel, onConfirm, loading = false }: Props = $props();

	let reason = $state('');
	let errorMsg = $state<string | null>(null);

	async function handleConfirm() {
		if (!reason.trim()) {
			errorMsg = 'Please share the reason.';
			return;
		}
		errorMsg = null;
		await onConfirm(reason.trim());
		reason = '';
	}

	function cancel() {
		reason = '';
		errorMsg = null;
		onCancel();
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && cancel()}>
	<Dialog.Content showClose={false}>
		<Dialog.Header>
			<Dialog.Title>Mark as lost</Dialog.Title>
			<Dialog.Description
				>What happened? This stays on the opportunity for context.</Dialog.Description
			>
		</Dialog.Header>
		<div class="space-y-1.5">
			<Label for="lost-reason">Reason <span class="text-destructive">*</span></Label>
			<Textarea
				id="lost-reason"
				bind:value={reason}
				rows={4}
				maxlength={500}
				placeholder="Went with another contractor"
			/>
			{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" disabled={loading} onclick={cancel}>Cancel</Button>
			<Button variant="destructive" disabled={loading} onclick={handleConfirm}>
				{loading ? 'Saving…' : 'Mark as lost'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
