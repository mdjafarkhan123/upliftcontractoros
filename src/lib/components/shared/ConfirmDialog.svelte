<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'default' as 'default' | 'destructive',
		onConfirm,
		onCancel,
		loading = false
	}: {
		open?: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'default' | 'destructive';
		onConfirm: () => void | Promise<void>;
		onCancel?: () => void;
		loading?: boolean;
	} = $props();

	async function handleConfirm() {
		await onConfirm();
		open = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && onCancel?.()}>
	<Dialog.Content showClose={false}>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description>{description}</Dialog.Description>
			{/if}
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" disabled={loading} onclick={() => (open = false)}>
				{cancelLabel}
			</Button>
			<JetEngineButton
				{variant}
				label={confirmLabel}
				loadingLabel="Working…"
				successLabel="Done"
				state={loading ? 'loading' : 'idle'}
				onclick={handleConfirm}
			/>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
