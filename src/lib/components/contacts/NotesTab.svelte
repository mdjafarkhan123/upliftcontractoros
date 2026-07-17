<script lang="ts">
	import { Dialog } from 'bits-ui';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type Note = {
		id: string;
		content: string;
		author_id: string | null;
		author_name: string | null;
		created_at: string | Date;
	};

	let {
		contactId,
		notes = $bindable<Note[]>([]),
		canEdit,
		composerOpen = $bindable(false)
	}: {
		contactId: string;
		notes?: Note[];
		canEdit: boolean;
		composerOpen?: boolean;
	} = $props();

	let draft = $state('');
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	let confirmOpen = $state(false);
	let pendingDeleteId = $state<string | null>(null);
	let deleting = $state(false);

	async function save() {
		const content = draft.trim();
		if (!content || saving) return;
		saving = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/contacts/${contactId}/notes`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.error ?? 'Failed to save note.';
			} else {
				const body = (await res.json()) as { note: Note };
				notes = [body.note, ...notes];
				draft = '';
				composerOpen = false;
			}
		} finally {
			saving = false;
		}
	}

	function askDelete(id: string) {
		pendingDeleteId = id;
		confirmOpen = true;
	}

	async function confirmDelete() {
		if (!pendingDeleteId) return;
		deleting = true;
		try {
			const res = await fetch(`/api/contacts/${contactId}/notes/${pendingDeleteId}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				notes = notes.filter((n) => n.id !== pendingDeleteId);
			}
		} finally {
			deleting = false;
			pendingDeleteId = null;
		}
	}

	function formatWhen(v: string | Date) {
		try {
			return new Date(v).toLocaleString();
		} catch {
			return String(v);
		}
	}

	// Reset draft when dialog closes
	$effect(() => {
		if (!composerOpen) {
			draft = '';
			errorMsg = null;
		}
	});
</script>

<div class="contact-notes">
	{#if canEdit}
		<Button onclick={() => (composerOpen = true)}>
			<i class="ri-add-line" aria-hidden="true"></i> Add note
		</Button>
	{/if}

	{#if notes.length === 0}
		<EmptyState
			title="No notes yet"
			description={canEdit
				? 'Add a note to keep context handy for your team.'
				: 'Notes added to this contact will appear here.'}
			iconClass="ri-sticky-note-line"
		/>
	{:else}
		<ul class="contact-notes__list">
			{#each notes as note (note.id)}
				<li class="contact-notes__card">
					<div class="contact-notes__card-head">
						<p class="contact-notes__content">{note.content}</p>
						{#if canEdit}
							<button
								type="button"
								class="contact-notes__delete"
								aria-label="Delete note"
								onclick={() => askDelete(note.id)}
							>
								<i class="ri-delete-bin-line" aria-hidden="true"></i>
							</button>
						{/if}
					</div>
					<div class="contact-notes__meta">
						{#if note.author_name}<span>{note.author_name}</span>{/if}
						<time>{formatWhen(note.created_at)}</time>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- Add note dialog -->
<Dialog.Root bind:open={composerOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay" />
		<Dialog.Content class="dialog-content">
			<div class="dialog-content__header">
				<div>
					<h2 class="dialog-content__title">Add note</h2>
				</div>
				<Dialog.Close class="dialog-content__close">
					<i class="ri-close-line contact-notes__close-icon" aria-hidden="true"></i>
				</Dialog.Close>
			</div>
			<div class="contact-notes__composer">
				<div class="field">
					<textarea class="field__textarea" bind:value={draft} placeholder="Write a note…" rows={5}
					></textarea>
				</div>
				{#if errorMsg}
					<p class="field__error">{errorMsg}</p>
				{/if}
				<div class="contact-notes__composer-actions">
					<Button variant="secondary" disabled={saving} onclick={() => (composerOpen = false)}>
						Cancel
					</Button>
					<Button
						loadingLabel="Saving…"
						successLabel="Saved"
						loading={saving}
						disabled={draft.trim().length === 0}
						onclick={save}
					>
						Save note
					</Button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Delete note?"
	description="This will remove the note from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-notes__close-icon {
		font-size: $fs-body;
	}
</style>
