<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AlertTriangle, Briefcase, FileText, Receipt, GitBranch, MessageSquare } from '@lucide/svelte';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';

	let {
		open = $bindable(false),
		full_name,
		counts,
		onConfirm
	}: {
		open?: boolean;
		full_name: string;
		counts: {
			opportunities: number;
			jobs: number;
			quotes: number;
			invoices: number;
			conversations: number;
		};
		onConfirm: () => Promise<void>;
	} = $props();

	let nameInput = $state('');
	let busy = $state(false);

	const hasLinks = $derived(
		counts.opportunities > 0 ||
		counts.jobs > 0 ||
		counts.quotes > 0 ||
		counts.invoices > 0 ||
		counts.conversations > 0
	);

	const linkedItems = $derived([
		counts.opportunities > 0 && { icon: GitBranch, label: `${counts.opportunities} opportunit${counts.opportunities === 1 ? 'y' : 'ies'}` },
		counts.jobs > 0 && { icon: Briefcase, label: `${counts.jobs} job${counts.jobs === 1 ? '' : 's'}` },
		counts.quotes > 0 && { icon: FileText, label: `${counts.quotes} quote${counts.quotes === 1 ? '' : 's'}` },
		counts.invoices > 0 && { icon: Receipt, label: `${counts.invoices} invoice${counts.invoices === 1 ? '' : 's'}` },
		counts.conversations > 0 && { icon: MessageSquare, label: `${counts.conversations} conversation${counts.conversations === 1 ? '' : 's'}` }
	].filter(Boolean) as Array<{ icon: typeof GitBranch; label: string }>);

	const canDelete = $derived(nameInput.trim() === full_name.trim());

	async function handleConfirm() {
		if (!canDelete || busy) return;
		busy = true;
		try {
			await onConfirm();
			open = false;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if (!open) nameInput = '';
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md" showClose={false}>
		<Dialog.Header>
			<div class="flex items-start gap-3">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
					<AlertTriangle class="h-5 w-5 text-destructive" />
				</div>
				<div>
					<Dialog.Title class="text-left text-base font-semibold">Delete {full_name}?</Dialog.Title>
					<Dialog.Description class="mt-0.5 text-left text-sm text-muted-foreground">
						This permanently deletes the contact. This cannot be undone.
					</Dialog.Description>
				</div>
			</div>
		</Dialog.Header>

		{#if hasLinks}
			<div class="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
				<p class="mb-2 text-xs font-semibold text-destructive">All linked records will also be deleted:</p>
				<ul class="space-y-1.5">
					{#each linkedItems as item (item.label)}
						<li class="flex items-center gap-2 text-xs text-destructive/80">
							<item.icon class="h-3.5 w-3.5 shrink-0" />
							{item.label}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="space-y-1.5">
			<Label for="confirm-name" class="text-sm font-medium">
				Type <span class="font-semibold text-foreground">{full_name}</span> to confirm
			</Label>
			<Input
				id="confirm-name"
				type="text"
				placeholder={full_name}
				bind:value={nameInput}
				autocomplete="off"
				class="h-11"
			/>
		</div>

		<Dialog.Footer class="gap-2 sm:gap-2">
			<Button
				variant="outline"
				class="flex-1 sm:flex-none"
				disabled={busy}
				onclick={() => (open = false)}
			>
				Cancel
			</Button>
			<JetEngineButton
				variant="destructive"
				label="Delete permanently"
				loadingLabel="Deleting…"
				successLabel="Deleted"
				state={busy ? 'loading' : 'idle'}
				disabled={!canDelete}
				onclick={handleConfirm}
				class="flex-1 sm:flex-none"
			/>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
