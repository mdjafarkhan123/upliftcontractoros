<script lang="ts" module>
	// One item in the recycle bin, mapped from any entity's list row. Each page
	// maps its own row (job/quote/contact) down to this shared shape.
	export type RecycleBinItem = {
		id: string;
		title: string;
		subtitle?: string | null;
		// Optional icon+label chips (e.g. phone, total). `icon` is a remix-icon class.
		pills?: { icon: string; label: string }[];
		deleted_at: string | null;
	};
</script>

<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { formatDate } from '$lib/utils/format';

	// Shared recycle-bin list — Restore-only (HubSpot / Pipedrive model). The daily
	// soft-delete purge sweep erases rows after `retentionDays`, so there is no
	// manual permanent-delete here. Reused by Jobs, Quotes, and Contacts.
	let {
		items,
		noun,
		restoreEndpoint,
		retentionDays = 30,
		canRestore,
		onRestored
	}: {
		items: RecycleBinItem[];
		noun: string;
		restoreEndpoint: (id: string) => string;
		retentionDays?: number;
		canRestore: boolean;
		onRestored: (id: string) => void;
	} = $props();

	let busyId = $state<string | null>(null);

	function daysLeft(deletedAt: string | null): number | null {
		if (!deletedAt) return null;
		const purgeAt = new Date(deletedAt).getTime() + retentionDays * 24 * 60 * 60 * 1000;
		return Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000));
	}

	function initials(title: string): string {
		return title
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}

	async function restore(item: RecycleBinItem) {
		if (busyId) return;
		busyId = item.id;
		try {
			const res = await fetch(restoreEndpoint(item.id), { method: 'POST' });
			if (res.ok) {
				toast.success(`Restored ${item.title}`);
				onRestored(item.id);
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? `Failed to restore ${noun}`);
			}
		} finally {
			busyId = null;
		}
	}
</script>

<ul class="recycle-bin">
	{#each items as item (item.id)}
		{@const left = daysLeft(item.deleted_at)}
		<li class="recycle-bin__row">
			<div class="recycle-bin__avatar">{initials(item.title) || '?'}</div>

			<div class="recycle-bin__body">
				<p class="recycle-bin__name">{item.title}</p>
				<div class="recycle-bin__meta">
					{#if item.subtitle}
						<span>{item.subtitle}</span>
					{/if}
					{#each item.pills ?? [] as pill (pill.label)}
						<span class="recycle-bin__pill">
							<i class={pill.icon} aria-hidden="true"></i>
							{pill.label}
						</span>
					{/each}
					{#if item.deleted_at}
						<span>Deleted {formatDate(item.deleted_at)}</span>
					{/if}
					{#if left !== null}
						<span class:recycle-bin__warn={left <= 7}>
							{left <= 0 ? 'Purging soon' : `Auto-deletes in ${left} day${left === 1 ? '' : 's'}`}
						</span>
					{/if}
				</div>
			</div>

			<div class="recycle-bin__actions">
				{#if canRestore}
					<button
						type="button"
						class="btn btn--secondary btn--sm"
						disabled={busyId === item.id}
						onclick={() => restore(item)}
					>
						<i class="ri-arrow-go-back-line" aria-hidden="true"></i>
						<span class="recycle-bin__restore-label">Restore</span>
					</button>
				{/if}
			</div>
		</li>
	{/each}
</ul>
