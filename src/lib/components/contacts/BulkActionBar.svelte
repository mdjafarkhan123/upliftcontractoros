<script lang="ts">
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import ContactTagsEditor from '$lib/components/contacts/ContactTagsEditor.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		ids,
		mode = 'active',
		canDelete = true,
		onDone,
		onCancel
	}: {
		ids: string[];
		// 'active' → Assign / Tag / Archive. 'archived' → Restore / Delete.
		mode?: 'active' | 'archived';
		// Gates the archived-view Delete action (requires can_delete_contacts).
		canDelete?: boolean;
		// Called after a successful action so the page can refresh + exit select mode.
		onDone: (opts: { removedIds?: string[] }) => void;
		onCancel: () => void;
	} = $props();

	const count = $derived(ids.length);

	let busy = $state(false);

	// --- Assign sheet ---
	let assignOpen = $state(false);
	let assignees = $state<Array<{ id: string; full_name: string }>>([]);
	let assigneesLoaded = $state(false);

	async function openAssign() {
		assignOpen = true;
		if (assigneesLoaded) return;
		try {
			const res = await fetch('/api/contacts/assignees');
			if (res.ok) {
				const body = (await res.json()) as { assignees: Array<{ id: string; full_name: string }> };
				assignees = body.assignees;
				assigneesLoaded = true;
			}
		} catch {
			toast.error('Could not load team members');
		}
	}

	async function applyAssign(assignedTo: string | null) {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/contacts/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'assign', contact_ids: ids, assigned_to: assignedTo })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				toast.success(
					`Updated ${body.updated ?? count} contact${(body.updated ?? count) === 1 ? '' : 's'}`
				);
				assignOpen = false;
				onDone({});
			} else {
				toast.error(body.error ?? 'Failed to assign contacts');
			}
		} finally {
			busy = false;
		}
	}

	// --- Tag sheet ---
	let tagOpen = $state(false);
	let tagValues = $state<string[]>([]);

	async function applyTags(action: 'tag_add' | 'tag_remove') {
		if (busy || tagValues.length === 0) return;
		busy = true;
		try {
			const res = await fetch('/api/contacts/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, contact_ids: ids, tags: tagValues })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				toast.success(
					action === 'tag_add'
						? `Tagged ${body.updated ?? count} contact${(body.updated ?? count) === 1 ? '' : 's'}`
						: `Removed tags from ${body.updated ?? count} contact${(body.updated ?? count) === 1 ? '' : 's'}`
				);
				tagOpen = false;
				tagValues = [];
				onDone({});
			} else {
				toast.error(body.error ?? 'Failed to update tags');
			}
		} finally {
			busy = false;
		}
	}

	// --- Archive ---
	let archiveOpen = $state(false);

	async function applyArchive() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/contacts/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'archive', contact_ids: ids })
			});
			const body = (await res.json().catch(() => ({}))) as {
				archived?: number;
				error?: string;
			};
			if (res.ok) {
				const archived = body.archived ?? count;
				toast.success(`Archived ${archived} contact${archived === 1 ? '' : 's'}`);
				onDone({ removedIds: ids });
			} else {
				toast.error(body.error ?? 'Failed to archive contacts');
			}
		} finally {
			busy = false;
		}
	}

	// --- Restore (unarchive) ---
	async function applyRestore() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/contacts/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'unarchive', contact_ids: ids })
			});
			const body = (await res.json().catch(() => ({}))) as { restored?: number; error?: string };
			if (res.ok) {
				const n = body.restored ?? count;
				toast.success(`Restored ${n} contact${n === 1 ? '' : 's'}`);
				onDone({ removedIds: ids });
			} else {
				toast.error(body.error ?? 'Failed to restore contacts');
			}
		} finally {
			busy = false;
		}
	}

	// --- Export selected ---
	async function exportSelected() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/contacts/export', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Export failed');
			}
			const blob = await res.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(a.href);
			toast.success(`Exported ${count} contact${count === 1 ? '' : 's'}`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Export failed');
		} finally {
			busy = false;
		}
	}

	// --- Delete (soft-delete to Recycle Bin) ---
	let deleteOpen = $state(false);

	async function applyDelete() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/contacts/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'delete', contact_ids: ids })
			});
			const body = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
			if (res.ok) {
				const n = body.deleted ?? count;
				toast.success(`Moved ${n} contact${n === 1 ? '' : 's'} to Recycle Bin`);
				onDone({ removedIds: ids });
			} else {
				toast.error(body.error ?? 'Failed to delete contacts');
			}
		} finally {
			busy = false;
		}
	}
</script>

<div class="bulk-bar">
	<div class="bulk-bar__inner">
		<button type="button" aria-label="Cancel selection" class="bulk-bar__cancel" onclick={onCancel}>
			<i class="ri-close-line" aria-hidden="true"></i>
		</button>
		<span class="bulk-bar__count">{count} selected</span>
		<div class="bulk-bar__actions">
			<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={exportSelected}>
				<i class="ri-download-line" aria-hidden="true"></i> Export
			</Button>
			{#if mode === 'archived'}
				<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={applyRestore}>
					<i class="ri-arrow-go-back-line" aria-hidden="true"></i> Restore
				</Button>
				{#if canDelete}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						style="color: var(--danger-solid);"
						disabled={busy}
						onclick={() => (deleteOpen = true)}
					>
						<i class="ri-delete-bin-line" aria-hidden="true"></i> Delete
					</Button>
				{/if}
			{:else}
				<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={openAssign}>
					<i class="ri-user-add-line" aria-hidden="true"></i> Assign
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onclick={() => (tagOpen = true)}
				>
					<i class="ri-price-tag-3-line" aria-hidden="true"></i> Tag
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					style="color: var(--warning-text);"
					disabled={busy}
					onclick={() => (archiveOpen = true)}
				>
					<i class="ri-archive-line" aria-hidden="true"></i> Archive
				</Button>
			{/if}
		</div>
	</div>
</div>

<BottomSheet bind:open={assignOpen} title="Assign {count} contact{count === 1 ? '' : 's'}">
	<div class="bulk-bar__assign-list">
		<button
			type="button"
			class="bulk-bar__assign-item"
			disabled={busy}
			onclick={() => applyAssign(null)}
		>
			<em>Unassign</em>
		</button>
		{#each assignees as a (a.id)}
			<button
				type="button"
				class="bulk-bar__assign-item"
				disabled={busy}
				onclick={() => applyAssign(a.id)}
			>
				{a.full_name}
			</button>
		{/each}
		{#if assigneesLoaded && assignees.length === 0}
			<p class="bulk-bar__assign-empty">No active team members.</p>
		{/if}
	</div>
</BottomSheet>

<BottomSheet
	bind:open={tagOpen}
	title="Tag {count} contact{count === 1 ? '' : 's'}"
	description="Pick one or more tags, then add or remove them across the selection."
>
	<div class="bulk-bar__tag-body">
		<ContactTagsEditor bind:value={tagValues} />
		<div class="bulk-bar__tag-actions">
			<Button
				type="button"
				variant="default"
				style="flex: 1;"
				disabled={busy || tagValues.length === 0}
				onclick={() => applyTags('tag_add')}
			>
				<i class="ri-check-line" aria-hidden="true"></i> Add to selection
			</Button>
			<Button
				type="button"
				variant="secondary"
				style="flex: 1;"
				disabled={busy || tagValues.length === 0}
				onclick={() => applyTags('tag_remove')}
			>
				<i class="ri-close-line" aria-hidden="true"></i> Remove from selection
			</Button>
		</div>
	</div>
</BottomSheet>

<ConfirmDialog
	bind:open={archiveOpen}
	title="Archive {count} contact{count === 1 ? '' : 's'}?"
	description="Archived contacts move off your active list but keep all their history — conversations, jobs, quotes, and invoices are all preserved. You can restore them any time."
	confirmLabel="Archive"
	loading={busy}
	onConfirm={applyArchive}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete {count} contact{count === 1 ? '' : 's'}?"
	description="They move to the Recycle Bin and can be restored within 30 days. Any linked jobs, quotes, invoices, and conversations are hidden too — all restorable together."
	confirmLabel="Move to Recycle Bin"
	variant="destructive"
	loading={busy}
	onConfirm={applyDelete}
/>
