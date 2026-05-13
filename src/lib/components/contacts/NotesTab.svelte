<script lang="ts">
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Plus, Trash2, StickyNote } from '@lucide/svelte';

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
		canEdit
	}: {
		contactId: string;
		notes?: Note[];
		canEdit: boolean;
	} = $props();

	let composerOpen = $state(false);
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
</script>

<div class="flex flex-col gap-4">
	{#if canEdit}
		<Button onclick={() => (composerOpen = true)} class="w-full md:w-auto">
			<Plus class="h-4 w-4" /> Add note
		</Button>
	{/if}

	{#if notes.length === 0}
		<EmptyState
			title="No notes yet"
			description={canEdit
				? 'Add a note to keep context handy for your team.'
				: 'Notes added to this contact will appear here.'}
			icon={StickyNote}
		/>
	{:else}
		<ul class="space-y-3">
			{#each notes as note (note.id)}
				<li class="rounded-xl border border-border bg-card p-4">
					<div class="flex items-start justify-between gap-2">
						<p class="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
						{#if canEdit}
							<button
								type="button"
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								aria-label="Delete note"
								onclick={() => askDelete(note.id)}
							>
								<Trash2 class="h-4 w-4" />
							</button>
						{/if}
					</div>
					<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
						{#if note.author_name}<span>{note.author_name}</span>{/if}
						<time>{formatWhen(note.created_at)}</time>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<BottomSheet bind:open={composerOpen} title="Add note">
	<div class="space-y-3 px-1 pb-2 pt-3">
		<Textarea bind:value={draft} placeholder="Write a note…" rows={5} />
		{#if errorMsg}
			<p class="text-sm text-destructive">{errorMsg}</p>
		{/if}
		<div class="flex justify-end gap-2">
			<Button variant="outline" disabled={saving} onclick={() => (composerOpen = false)}>
				Cancel
			</Button>
			<Button disabled={saving || draft.trim().length === 0} onclick={save}>
				{saving ? 'Saving…' : 'Save note'}
			</Button>
		</div>
	</div>
</BottomSheet>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Delete note?"
	description="This will remove the note from this contact."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={confirmDelete}
/>
