<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';

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

	type LinkedItem = { icon: string; label: string };
	const linkedItems = $derived(
		[
			counts.opportunities > 0 && {
				icon: 'ri-git-branch-line',
				label: `${counts.opportunities} opportunit${counts.opportunities === 1 ? 'y' : 'ies'}`
			},
			counts.jobs > 0 && {
				icon: 'ri-briefcase-line',
				label: `${counts.jobs} job${counts.jobs === 1 ? '' : 's'}`
			},
			counts.quotes > 0 && {
				icon: 'ri-file-text-line',
				label: `${counts.quotes} quote${counts.quotes === 1 ? '' : 's'}`
			},
			counts.invoices > 0 && {
				icon: 'ri-receipt-line',
				label: `${counts.invoices} invoice${counts.invoices === 1 ? '' : 's'}`
			},
			counts.conversations > 0 && {
				icon: 'ri-message-2-line',
				label: `${counts.conversations} conversation${counts.conversations === 1 ? '' : 's'}`
			}
		].filter(Boolean) as LinkedItem[]
	);

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
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay" />
		<Dialog.Content class="dialog-content">
			<!-- Header -->
			<div class="contact-delete__head" style="margin-bottom:1.25rem;">
				<div class="contact-delete__icon-wrap">
					<i class="ri-alert-line" aria-hidden="true"></i>
				</div>
				<div class="contact-delete__head-body">
					<h2 class="contact-delete__title">Delete {full_name}?</h2>
					<p class="contact-delete__desc">
						This permanently deletes the contact. This cannot be undone.
					</p>
				</div>
			</div>

			<div class="dialog-content__body">
				<!-- Linked items warning -->
				{#if hasLinks}
					<div class="contact-delete__links-warn">
						<p class="contact-delete__links-title">All linked records will also be deleted:</p>
						<ul class="contact-delete__links-list">
							{#each linkedItems as item (item.label)}
								<li class="contact-delete__links-item">
									<i class={item.icon} aria-hidden="true"></i>
									{item.label}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Confirm name input -->
				<div class="field">
					<label class="field__label" for="confirm-name">
						Type <strong>{full_name}</strong> to confirm
					</label>
					<input
						id="confirm-name"
						type="text"
						class="field__input"
						placeholder={full_name}
						bind:value={nameInput}
						autocomplete="off"
					/>
				</div>
			</div>

			<div class="dialog-content__footer">
				<Button variant="secondary" style="flex:1;" disabled={busy} onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button
					variant="destructive"
					loadingLabel="Deleting…"
					successLabel="Deleted"
					loading={busy}
					disabled={!canDelete}
					onclick={handleConfirm}
					class="flex-1"
				>
					Delete permanently
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
