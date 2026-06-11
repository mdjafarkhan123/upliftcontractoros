<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import ContactTagsEditor from '$lib/components/contacts/ContactTagsEditor.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import { UserPlus, Tag, Archive, X, Check } from '@lucide/svelte';

	let {
		ids,
		onDone,
		onCancel
	}: {
		ids: string[];
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
				skipped?: Array<{ id: string; full_name: string }>;
				error?: string;
			};
			if (res.ok) {
				const archived = body.archived ?? 0;
				const skipped = body.skipped?.length ?? 0;
				const archivedIds = ids.filter((id) => !(body.skipped ?? []).some((s) => s.id === id));
				if (skipped > 0) {
					toast.info(`Archived ${archived}, skipped ${skipped} with active records`);
				} else {
					toast.success(`Archived ${archived} contact${archived === 1 ? '' : 's'}`);
				}
				onDone({ removedIds: archivedIds });
			} else {
				toast.error(body.error ?? 'Failed to archive contacts');
			}
		} finally {
			busy = false;
		}
	}
</script>

<div
	class={cn(
		'fixed inset-x-0 z-40 px-3',
		'bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.5rem)] md:bottom-6'
	)}
>
	<div
		class="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-dropdown"
	>
		<button
			type="button"
			aria-label="Cancel selection"
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
			onclick={onCancel}
		>
			<X class="h-5 w-5" />
		</button>
		<span class="shrink-0 px-1 text-sm font-semibold tabular-nums">{count} selected</span>
		<div class="flex flex-1 items-center justify-end gap-1">
			<Button variant="ghost" size="sm" class="h-11" disabled={busy} onclick={openAssign}>
				<UserPlus class="h-4 w-4" /> Assign
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="h-11"
				disabled={busy}
				onclick={() => (tagOpen = true)}
			>
				<Tag class="h-4 w-4" /> Tag
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="h-11 text-amber-700 dark:text-amber-400"
				disabled={busy}
				onclick={() => (archiveOpen = true)}
			>
				<Archive class="h-4 w-4" /> Archive
			</Button>
		</div>
	</div>
</div>

<BottomSheet bind:open={assignOpen} title="Assign {count} contact{count === 1 ? '' : 's'}">
	<div class="mt-2 space-y-1 pb-2">
		<button
			type="button"
			class="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm hover:bg-muted disabled:opacity-50"
			disabled={busy}
			onclick={() => applyAssign(null)}
		>
			<span class="italic text-muted-foreground">Unassign</span>
		</button>
		{#each assignees as a (a.id)}
			<button
				type="button"
				class="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm hover:bg-muted disabled:opacity-50"
				disabled={busy}
				onclick={() => applyAssign(a.id)}
			>
				{a.full_name}
			</button>
		{/each}
		{#if assigneesLoaded && assignees.length === 0}
			<p class="px-3 py-2 text-sm text-muted-foreground">No active team members.</p>
		{/if}
	</div>
</BottomSheet>

<BottomSheet
	bind:open={tagOpen}
	title="Tag {count} contact{count === 1 ? '' : 's'}"
	description="Pick one or more tags, then add or remove them across the selection."
>
	<div class="mt-2 space-y-4 pb-2">
		<ContactTagsEditor bind:value={tagValues} />
		<div class="flex gap-2">
			<Button
				class="flex-1"
				disabled={busy || tagValues.length === 0}
				onclick={() => applyTags('tag_add')}
			>
				<Check class="h-4 w-4" /> Add to selection
			</Button>
			<Button
				variant="outline"
				class="flex-1"
				disabled={busy || tagValues.length === 0}
				onclick={() => applyTags('tag_remove')}
			>
				<X class="h-4 w-4" /> Remove from selection
			</Button>
		</div>
	</div>
</BottomSheet>

<ConfirmDialog
	bind:open={archiveOpen}
	title="Archive {count} contact{count === 1 ? '' : 's'}?"
	description="Archived contacts move off your active list but keep all their history — conversations, jobs, quotes, and invoices are all preserved. Contacts with open quotes, jobs, or invoices will be skipped."
	confirmLabel="Archive"
	loading={busy}
	onConfirm={applyArchive}
/>
