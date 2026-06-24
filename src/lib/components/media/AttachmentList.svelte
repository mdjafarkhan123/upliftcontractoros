<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import MediaUploader from './MediaUploader.svelte';
	import type { LocalMediaItem } from './types';
	import { FileText, Download, Trash2, Loader2, Paperclip } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';

	let {
		parentFk,
		purposeTag,
		title = 'Attachments',
		uploadLabel = 'Add photos',
		canUpload = false,
		canDelete = false
	}: {
		parentFk: {
			contact_id?: string;
			opportunity_id?: string;
			job_id?: string;
			quote_id?: string;
			invoice_id?: string;
		};
		purposeTag:
			| 'quote_attachment'
			| 'invoice_attachment'
			| 'contact_attachment'
			| 'opportunity_attachment';
		title?: string;
		uploadLabel?: string;
		canUpload?: boolean;
		canDelete?: boolean;
	} = $props();

	let items = $state<LocalMediaItem[]>([]);
	let loading = $state(true);
	let deleteTarget = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let downloadingId = $state<string | null>(null);

	const queryParam = $derived(
		parentFk.contact_id
			? `contact_id=${parentFk.contact_id}`
			: parentFk.opportunity_id
				? `opportunity_id=${parentFk.opportunity_id}`
				: parentFk.quote_id
					? `quote_id=${parentFk.quote_id}`
					: parentFk.invoice_id
						? `invoice_id=${parentFk.invoice_id}`
						: parentFk.job_id
							? `job_id=${parentFk.job_id}`
							: ''
	);

	async function load() {
		if (!queryParam) return;
		loading = true;
		try {
			const res = await fetch(`/api/media/list?${queryParam}`);
			if (!res.ok) return;
			const body = (await res.json()) as {
				data: {
					id: string;
					r2_key: string;
					thumbnail_key: string | null;
					web_key: string | null;
					original_filename: string;
					file_size_bytes: number;
					media_type: 'photo' | 'pdf' | 'attachment';
					mime_type: string;
					purpose_tag: string;
					created_at: string;
				}[];
			};
			// Only show attachments for this purpose_tag
			items = body.data
				.filter((r) => r.purpose_tag === purposeTag)
				.map((r) => ({ localId: r.id, status: 'done' as const, ...r }));
		} finally {
			loading = false;
		}
	}

	async function download(item: LocalMediaItem) {
		if (!item.id) return;
		downloadingId = item.id;
		try {
			const res = await fetch(`/api/media/${item.id}/url?variant=original`);
			if (!res.ok) {
				toast.error('Could not generate download link');
				return;
			}
			const body = (await res.json()) as { data?: { url: string } };
			if (!body.data?.url) return;
			const a = document.createElement('a');
			a.href = body.data.url;
			a.download = item.original_filename ?? 'attachment';
			a.target = '_blank';
			a.rel = 'noopener noreferrer';
			a.click();
		} finally {
			downloadingId = null;
		}
	}

	function onOptimisticAdd(item: LocalMediaItem) {
		const idx = items.findIndex((it) => it.localId === item.localId);
		if (idx >= 0) {
			items = items.map((it, i) => (i === idx ? item : it));
		} else {
			items = [item, ...items];
		}
	}

	function onOptimisticRemove(localId: string) {
		items = items.filter((it) => it.localId !== localId);
	}

	function onUploaded(item: LocalMediaItem) {
		items = [item, ...items.filter((it) => it.localId !== item.localId)];
	}

	async function doDelete() {
		if (!deleteTarget) return;
		const item = items.find((it) => it.localId === deleteTarget);
		if (!item?.id) {
			deleteTarget = null;
			deleteOpen = false;
			return;
		}
		deleting = true;
		try {
			const res = await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Failed to delete');
				return;
			}
			items = items.filter((it) => it.localId !== deleteTarget);
			toast.success('Attachment deleted');
		} finally {
			deleting = false;
			deleteTarget = null;
			deleteOpen = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	onMount(() => {
		void load();
	});
</script>

<section class="rounded-xl border border-border bg-card p-4">
	<div class="mb-3 flex items-center justify-between gap-3">
		<div class="flex items-center gap-1.5">
			<Paperclip class="h-4 w-4 text-muted-foreground" />
			<h2 class="text-sm font-semibold text-foreground">{title}</h2>
			{#if !loading}
				<span class="text-xs text-muted-foreground"
					>({items.filter((i) => i.status !== 'error').length})</span
				>
			{/if}
		</div>
		{#if canUpload}
			<MediaUploader
				{purposeTag}
				{parentFk}
				label={uploadLabel}
				{onOptimisticAdd}
				{onOptimisticRemove}
				{onUploaded}
			/>
		{/if}
	</div>

	{#if loading}
		<div class="space-y-2">
			{#each [0, 1] as i (i)}
				<div class="skeleton-shimmer h-14 rounded-lg bg-muted"></div>
			{/each}
		</div>
	{:else if items.length === 0}
		<EmptyState
			title="No attachments"
			description={canUpload ? `Tap "${uploadLabel}" to attach a file.` : 'No attachments yet.'}
		/>
	{:else}
		<ul class="space-y-2">
			{#each items as item (item.localId)}
				<li
					class={cn(
						'flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-3 transition-colors',
						item.status === 'uploading' && 'opacity-60'
					)}
				>
					<!-- Icon / inline preview -->
					{#if item.media_type === 'pdf' || item.mime_type === 'application/pdf'}
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-500/10"
						>
							<FileText class="h-5 w-5 text-rose-500" />
						</div>
					{:else if item.previewUrl ?? item.thumbnailUrl}
						<!-- Inline image preview -->
						<div class="h-10 w-10 shrink-0 overflow-hidden rounded-md">
							<img
								src={item.thumbnailUrl ?? item.previewUrl}
								alt={item.original_filename}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						</div>
					{:else}
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
							<FileText class="h-5 w-5 text-muted-foreground" />
						</div>
					{/if}

					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-foreground">
							{item.original_filename ?? 'Attachment'}
						</p>
						<p class="text-xs text-muted-foreground">
							{#if item.file_size_bytes !== undefined}
								{formatBytes(item.file_size_bytes)}
							{/if}
							{#if item.status === 'uploading'}
								{#if item.progress !== undefined}
									· {Math.round(item.progress)}%
								{/if}
							{/if}
						</p>

						<!-- Upload progress bar -->
						{#if item.status === 'uploading' && item.progress !== undefined}
							<div class="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
								<div
									class="h-full rounded-full bg-primary transition-all duration-150"
									style:width="{item.progress}%"
								></div>
							</div>
						{/if}
					</div>

					<!-- Actions -->
					<div class="flex shrink-0 items-center gap-1">
						{#if item.status === 'done' && item.id}
							<button
								class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
								onclick={() => download(item)}
								disabled={downloadingId === item.id}
								aria-label="Download"
							>
								{#if downloadingId === item.id}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<Download class="h-4 w-4" />
								{/if}
							</button>

							{#if canDelete}
								<button
									class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
									onclick={() => {
										deleteTarget = item.localId;
										deleteOpen = true;
									}}
									aria-label="Delete attachment"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete attachment?"
	description="This file will be permanently removed."
	confirmLabel="Delete"
	variant="destructive"
	loading={deleting}
	onConfirm={doDelete}
/>
