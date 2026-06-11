<script lang="ts">
	import { RotateCcw, Trash2, Phone } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatDate } from '$lib/utils/format';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { cn } from '$lib/utils/cn';
	import type { ContactListItem } from '$lib/stores/contacts.svelte';

	const RETENTION_DAYS = 30;

	let {
		items,
		canRestore,
		canPurge,
		onChanged
	}: {
		items: ContactListItem[];
		canRestore: boolean;
		canPurge: boolean;
		onChanged: (id: string) => void;
	} = $props();

	let busyId = $state<string | null>(null);
	let confirmOpen = $state(false);
	let target = $state<ContactListItem | null>(null);

	function daysLeft(deletedAt: string | null): number | null {
		if (!deletedAt) return null;
		const purgeAt = new Date(deletedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000;
		return Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
	}

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}

	async function restore(c: ContactListItem) {
		if (busyId) return;
		busyId = c.id;
		try {
			const res = await fetch(`/api/contacts/${c.id}/restore`, { method: 'POST' });
			if (res.ok) {
				toast.success(`Restored ${c.full_name}`);
				onChanged(c.id);
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to restore contact');
			}
		} finally {
			busyId = null;
		}
	}

	function askPurge(c: ContactListItem) {
		target = c;
		confirmOpen = true;
	}

	async function confirmPurge() {
		const c = target;
		if (!c) return;
		busyId = c.id;
		try {
			const res = await fetch(`/api/contacts/${c.id}?permanent=true`, { method: 'DELETE' });
			if (res.ok) {
				toast.success(`Permanently deleted ${c.full_name}`);
				onChanged(c.id);
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to delete contact');
			}
		} finally {
			busyId = null;
			target = null;
		}
	}
</script>

<ul class="grid gap-3">
	{#each items as c (c.id)}
		{@const left = daysLeft(c.deleted_at)}
		<li
			class="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-card sm:p-4"
		>
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground ring-2 ring-border/50"
			>
				{initials(c.full_name) || '?'}
			</div>

			<div class="min-w-0 flex-1">
				<p class="truncate font-medium text-foreground">{c.full_name}</p>
				<div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
					{#if c.phone}
						<span class="inline-flex items-center gap-1">
							<Phone class="h-3 w-3" />
							{formatPhoneDisplay(c.phone)}
						</span>
					{/if}
					{#if c.deleted_at}
						<span>Deleted {formatDate(c.deleted_at)}</span>
					{/if}
					{#if left !== null}
						<span class={cn(left <= 7 && 'font-medium text-amber-600 dark:text-amber-400')}>
							{left <= 0 ? 'Purging soon' : `Auto-deletes in ${left} day${left === 1 ? '' : 's'}`}
						</span>
					{/if}
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-1.5">
				{#if canRestore}
					<Button
						variant="outline"
						size="sm"
						class="h-9"
						disabled={busyId === c.id}
						onclick={() => restore(c)}
					>
						<RotateCcw class="h-4 w-4" />
						<span class="hidden sm:inline">Restore</span>
					</Button>
				{/if}
				{#if canPurge}
					<Button
						variant="ghost"
						size="icon"
						class="h-9 w-9 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
						aria-label="Delete forever"
						disabled={busyId === c.id}
						onclick={() => askPurge(c)}
					>
						<Trash2 class="h-4 w-4" />
					</Button>
				{/if}
			</div>
		</li>
	{/each}
</ul>

<ConfirmDialog
	bind:open={confirmOpen}
	title={target ? `Permanently delete ${target.full_name}?` : 'Permanently delete?'}
	description="This cannot be undone. The contact and its reserved phone number will be removed for good. Contacts with linked jobs, quotes, invoices, or conversations can't be permanently deleted — restore them instead."
	confirmLabel="Delete forever"
	variant="destructive"
	loading={busyId === target?.id}
	onConfirm={confirmPurge}
/>
