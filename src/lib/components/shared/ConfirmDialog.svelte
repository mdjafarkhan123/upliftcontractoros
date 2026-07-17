<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

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

	// The Cancel button sets `open` programmatically, which does NOT trigger bits-ui's
	// onOpenChange (that fires only for primitive-driven closes like ESC / click-outside).
	// So invoke onCancel here explicitly, otherwise a Cancel-button dismiss skips it.
	function handleCancel() {
		open = false;
		onCancel?.();
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
			<Button variant="outline" disabled={loading} onclick={handleCancel}>
				{cancelLabel}
			</Button>
			<Button
				{variant}
				loadingLabel="Working…"
				successLabel="Done"
				{loading}
				onclick={handleConfirm}
			>
				{confirmLabel}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
