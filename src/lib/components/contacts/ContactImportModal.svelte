<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import { createRealtimeManager, type RealtimeManager } from '$lib/stores/realtimeReconnect';
	import {
		HEADER_MAP,
		normalizeKey,
		CANONICAL_FIELD_LABELS
	} from '$lib/contacts/csvHeaders';
	import {
		Upload,
		FileSpreadsheet,
		CheckCircle,
		AlertCircle,
		X,
		Download,
		Ban,
		Check
	} from '@lucide/svelte';

	// The contact_imports row shape we care about (snake_case, straight from the
	// DB via the GET fallback and Realtime UPDATE payloads).
	type ImportRow = {
		id: string;
		status: 'pending' | 'processing' | 'completed' | 'cancelling' | 'cancelled' | 'failed';
		total_rows: number;
		processed_rows: number;
		imported: number;
		updated: number;
		skipped: number;
		failed: number;
		error_rows: { row: number; reason: string }[];
		last_error: string | null;
	};

	type Stage = 'idle' | 'parsed' | 'uploading' | 'processing' | 'done';

	// Survives a page refresh: lets the modal re-attach to an in-flight import.
	const ACTIVE_KEY = 'contactImport:active';
	const TERMINAL: ImportRow['status'][] = ['completed', 'cancelled', 'failed'];

	let { open = $bindable(false), onDone }: { open?: boolean; onDone: () => void } = $props();

	let stage = $state<Stage>('idle');
	let dragging = $state(false);
	let file = $state<File | null>(null);
	let previewHeaders = $state<string[]>([]);
	let previewRows = $state<string[][]>([]);
	let totalRows = $state(0);
	// What to do with a row that matches an existing contact (by phone or email).
	let onDuplicate = $state<'skip' | 'update'>('skip');

	let importId = $state<string | null>(null);
	let progress = $state<ImportRow | null>(null);
	let cancelling = $state(false);
	// Persistent in-modal error (e.g. a 400 from the upload) — a toast alone is too
	// easy to miss, so we also show it inline on the preview step.
	let uploadError = $state<string | null>(null);

	let manager: RealtimeManager | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let realtimeConnected = false;
	let resumeChecked = false;

	const percent = $derived(
		progress && progress.total_rows > 0
			? Math.min(100, Math.round((progress.processed_rows / progress.total_rows) * 100))
			: 0
	);
	const finalStatus = $derived(progress?.status ?? null);
	// True while the worker is busy but hasn't reported a measurable % yet (e.g. a
	// small all-duplicate file mid-update, where the first batch hasn't committed its
	// progress count). We show a sliding indeterminate bar instead of a frozen 0%.
	const indeterminate = $derived(
		!!progress &&
			(progress.status === 'pending' || progress.status === 'processing') &&
			progress.processed_rows === 0
	);
	// Rows the user should look at: hard failures + contacts imported without a
	// valid phone. Drives the downloadable report on the done step.
	const flaggedCount = $derived(progress?.error_rows?.length ?? 0);

	// Which uploaded columns we recognize vs silently drop. Uses the SAME HEADER_MAP
	// the server imports with (shared module), so the hint never lies. `mapped` is the
	// set of friendly field labels detected; `ignored` is the user's original header
	// text for columns we won't import — surfaced so nothing is lost without warning.
	const headerMapping = $derived.by(() => {
		const mapped: string[] = [];
		const seenCanonical: string[] = [];
		const ignored: string[] = [];
		for (const h of previewHeaders) {
			const canonical = HEADER_MAP[normalizeKey(h)];
			if (canonical) {
				if (!seenCanonical.includes(canonical)) {
					seenCanonical.push(canonical);
					mapped.push(CANONICAL_FIELD_LABELS[canonical] ?? canonical);
				}
			} else if (h.trim()) {
				ignored.push(h);
			}
		}
		return { mapped, ignored };
	});

	function stopTracking() {
		manager?.destroy();
		manager = null;
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		realtimeConnected = false;
	}

	function reset() {
		stopTracking();
		stage = 'idle';
		dragging = false;
		file = null;
		previewHeaders = [];
		previewRows = [];
		totalRows = 0;
		onDuplicate = 'skip';
		importId = null;
		progress = null;
		cancelling = false;
		uploadError = null;
	}

	function handleClose() {
		open = false;
		setTimeout(reset, 250);
	}

	function applyRow(row: ImportRow) {
		progress = row;
		if (TERMINAL.includes(row.status)) {
			stopTracking();
			try {
				localStorage.removeItem(ACTIVE_KEY);
			} catch {
				// ignore storage failures
			}
			stage = 'done';
			if (row.imported > 0) onDone();
		} else {
			stage = 'processing';
		}
	}

	async function fetchRow(id: string): Promise<ImportRow | null> {
		try {
			const res = await fetch(`/api/contacts/import/${id}`);
			if (!res.ok) return null;
			const body = await res.json();
			return body.data as ImportRow;
		} catch {
			return null;
		}
	}

	function startTracking(id: string) {
		importId = id;
		try {
			localStorage.setItem(ACTIVE_KEY, id);
		} catch {
			// ignore storage failures
		}

		manager = createRealtimeManager({
			build: (supabase) =>
				supabase.channel(`contact_import:${id}`).on(
					'postgres_changes',
					{
						event: 'UPDATE',
						schema: 'public',
						table: 'contact_imports',
						filter: `id=eq.${id}`
					},
					(payload: { new: ImportRow }) => applyRow(payload.new)
				),
			onStatusChange: (c) => (realtimeConnected = c),
			// Re-sync on (re)connect — covers updates missed while the socket was down.
			onReconnect: async () => {
				const row = await fetchRow(id);
				if (row) applyRow(row);
			}
		});

		// Poll fallback: only fires while Realtime is not connected, so a missed
		// socket never leaves the bar frozen.
		pollTimer = setInterval(async () => {
			if (realtimeConnected) return;
			const row = await fetchRow(id);
			if (row) applyRow(row);
		}, 3000);

		// Seed immediately — the worker may already be running (or done) before the
		// subscription is live.
		void fetchRow(id).then((row) => {
			if (row) applyRow(row);
		});
	}

	function parseLine(line: string): string[] {
		const fields: string[] = [];
		let cur = '';
		let inQ = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQ && line[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQ = !inQ;
				}
			} else if (ch === ',' && !inQ) {
				fields.push(cur.trim());
				cur = '';
			} else {
				cur += ch;
			}
		}
		fields.push(cur.trim());
		return fields;
	}

	function loadPreview(text: string) {
		// Strip Excel's UTF-8 BOM so the first header parses cleanly.
		text = text.replace(/^﻿/, '');
		const lines = text.split(/\r?\n/).filter((l) => l.trim());
		if (lines.length < 1) return;
		previewHeaders = parseLine(lines[0]);
		previewRows = lines.slice(1, 6).map(parseLine);
		totalRows = Math.max(0, lines.length - 1);
	}

	function selectFile(f: File) {
		if (!f.name.toLowerCase().endsWith('.csv')) {
			toast.error('Please select a CSV file.');
			return;
		}
		if (f.size > 10 * 1024 * 1024) {
			toast.error('File too large. Maximum 10 MB.');
			return;
		}
		file = f;
		uploadError = null;
		const reader = new FileReader();
		reader.onload = (e) => {
			loadPreview((e.target?.result as string) ?? '');
			stage = 'parsed';
		};
		reader.readAsText(f);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const dropped = e.dataTransfer?.files[0];
		if (dropped) selectFile(dropped);
	}

	function onFileInput(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) selectFile(f);
	}

	async function runImport() {
		if (!file) return;
		stage = 'uploading';
		uploadError = null;
		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('on_duplicate', onDuplicate);
			const res = await fetch('/api/contacts/import', { method: 'POST', body: fd });
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'Import failed');
			startTracking(body.data.id as string);
			stage = 'processing';
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Import failed';
			uploadError = msg;
			toast.error(msg);
			stage = 'parsed';
		}
	}

	async function cancelImport() {
		if (!importId || cancelling) return;
		cancelling = true;
		try {
			const res = await fetch(`/api/contacts/import/${importId}`, { method: 'PATCH' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Could not cancel');
			}
			// The worker flips the row to 'cancelled'; Realtime/poll will land us on done.
		} catch (e) {
			cancelling = false;
			toast.error(e instanceof Error ? e.message : 'Could not cancel');
		}
	}

	async function downloadErrors() {
		if (!importId) return;
		try {
			const res = await fetch(`/api/contacts/import/${importId}/errors.csv`);
			if (!res.ok) throw new Error('Could not download error report');
			const blob = await res.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'import-errors.csv';
			a.click();
			URL.revokeObjectURL(a.href);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not download error report');
		}
	}

	function downloadTemplate() {
		const csv =
			'Full Name,Phone,Alt Phone,Email,Status,Lead Source,Tags,Notes\n' +
			'Jane Smith,+12125551234,,jane@example.com,lead,manual,vip,First time caller\n' +
			'Bob Johnson,+13105559876,+13105550001,bob@example.com,customer,referral,homeowner|\n';
		const blob = new Blob([csv], { type: 'text/csv' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'contacts-template.csv';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	// Refresh-proof resume: when the modal opens, re-attach to an in-flight import
	// recorded before a refresh. Work runs server-side regardless of the browser.
	$effect(() => {
		if (!open) {
			resumeChecked = false;
			return;
		}
		if (resumeChecked) return;
		resumeChecked = true;

		let storedId: string | null = null;
		try {
			storedId = localStorage.getItem(ACTIVE_KEY);
		} catch {
			storedId = null;
		}
		if (!storedId) return;

		void fetchRow(storedId).then((row) => {
			if (!row) {
				try {
					localStorage.removeItem(ACTIVE_KEY);
				} catch {
					// ignore
				}
				return;
			}
			if (TERMINAL.includes(row.status)) {
				importId = storedId;
				applyRow(row);
			} else {
				startTracking(storedId);
			}
		});
	});

	// Wizard steps for the header progress rail. parsed = Review; everything from
	// upload onward (uploading/processing/done) sits on the final Import step.
	const STEPS = ['Upload', 'Review', 'Import'];
	const currentStep = $derived(stage === 'idle' ? 0 : stage === 'parsed' ? 1 : 2);

	function stepState(i: number): 'done' | 'active' | 'todo' {
		if (stage === 'done') return 'done';
		if (i < currentStep) return 'done';
		if (i === currentStep) return 'active';
		return 'todo';
	}

	function humanSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) handleClose();
	}}
>
	<Dialog.Content
		class="grid max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-0 sm:max-w-2xl"
	>
		<Dialog.Header class="space-y-3 border-b border-border/60 px-6 pt-6 pb-4">
			<div class="space-y-1">
				<Dialog.Title class="text-base font-semibold">Import Contacts</Dialog.Title>
				<Dialog.Description class="text-sm">
					Upload a CSV and we'll import your contacts in the background.
				</Dialog.Description>
			</div>

			<!-- Step rail -->
			<div class="flex items-center gap-2 pt-1">
				{#each STEPS as label, i (label)}
					{@const state = stepState(i)}
					<div class="flex items-center gap-2">
						<div
							class={cn(
								'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-150',
								state === 'done' && 'bg-primary text-primary-foreground',
								state === 'active' && 'bg-primary/10 text-primary ring-1 ring-primary/30',
								state === 'todo' && 'bg-muted text-muted-foreground'
							)}
						>
							{#if state === 'done'}
								<Check class="h-3.5 w-3.5" />
							{:else}
								{i + 1}
							{/if}
						</div>
						<span
							class={cn(
								'text-xs font-medium transition-colors duration-150',
								state === 'active' ? 'text-foreground' : 'text-muted-foreground'
							)}
						>
							{label}
						</span>
						{#if i < STEPS.length - 1}
							<div class="h-px w-5 bg-border sm:w-8"></div>
						{/if}
					</div>
				{/each}
			</div>
		</Dialog.Header>

		<div class="min-h-0 overflow-y-auto px-6 py-4">
			{#snippet statTiles(imported: number, skipped: number, failed: number, updated = 0)}
				<div class={cn('grid gap-2', updated > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
					<div class="rounded-xl border border-border/60 bg-card px-3 py-3 text-center">
						<p class="text-xl font-semibold tracking-tight text-foreground">
							{imported.toLocaleString()}
						</p>
						<p
							class="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
						>
							Imported
						</p>
					</div>
					{#if updated > 0}
						<div class="rounded-xl border border-border/60 bg-card px-3 py-3 text-center">
							<p class="text-xl font-semibold tracking-tight text-foreground">
								{updated.toLocaleString()}
							</p>
							<p
								class="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
							>
								Updated
							</p>
						</div>
					{/if}
					<div class="rounded-xl border border-border/60 bg-card px-3 py-3 text-center">
						<p class="text-xl font-semibold tracking-tight text-foreground">
							{skipped.toLocaleString()}
						</p>
						<p
							class="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
						>
							Skipped
						</p>
					</div>
					<div
						class={cn(
							'rounded-xl border px-3 py-3 text-center',
							failed > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border/60 bg-card'
						)}
					>
						<p
							class={cn(
								'text-xl font-semibold tracking-tight',
								failed > 0 ? 'text-destructive' : 'text-foreground'
							)}
						>
							{failed.toLocaleString()}
						</p>
						<p
							class="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
						>
							Failed
						</p>
					</div>
				</div>
			{/snippet}

			{#if stage === 'idle'}
				<!-- Drop zone -->
				<div
					role="button"
					tabindex="0"
					class={cn(
						'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-150',
						dragging
							? 'border-primary bg-primary/5 ring-4 ring-primary/10'
							: 'border-border/70 hover:border-primary/40 hover:bg-muted/40'
					)}
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => {
						dragging = false;
					}}
					ondrop={onDrop}
					onclick={() => document.getElementById('csv-file-input')?.click()}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ')
							document.getElementById('csv-file-input')?.click();
					}}
				>
					<div
						class={cn(
							'flex h-14 w-14 items-center justify-center rounded-2xl transition-colors duration-150',
							dragging ? 'bg-primary/15' : 'bg-muted'
						)}
					>
						<Upload
							class={cn(
								'h-6 w-6 transition-colors duration-150',
								dragging ? 'text-primary' : 'text-muted-foreground'
							)}
						/>
					</div>
					<div>
						<p class="text-sm font-medium text-foreground">
							{dragging ? 'Drop to upload' : 'Drop your CSV here, or click to browse'}
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							CSV files only · up to 10 MB · max 10,000 contacts
						</p>
					</div>
					<input
						id="csv-file-input"
						type="file"
						accept=".csv"
						class="sr-only"
						onchange={onFileInput}
					/>
				</div>

				<div class="mt-3 flex items-center justify-between">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:underline"
						onclick={downloadTemplate}
					>
						<Download class="h-4 w-4" />
						Download template
					</button>
					<p class="text-xs text-muted-foreground">
						Need columns? Name, Phone, Email, Status, Source, Tags, Notes
					</p>
				</div>
			{:else if stage === 'parsed'}
				<!-- File chip + scrollable preview -->
				<div class="space-y-4">
					{#if uploadError}
						<div
							class="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3"
						>
							<AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
							<div class="min-w-0">
								<p class="text-sm font-medium text-destructive">Couldn't import this file</p>
								<p class="mt-0.5 text-xs text-muted-foreground">{uploadError}</p>
							</div>
						</div>
					{/if}
					<div
						class="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-3"
					>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
							<FileSpreadsheet class="h-4.5 w-4.5 text-primary" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-foreground">{file?.name}</p>
							<p class="text-xs text-muted-foreground">
								{totalRows.toLocaleString()} contact{totalRows !== 1 ? 's' : ''}
								{#if file}&nbsp;· {humanSize(file.size)}{/if}
							</p>
						</div>
						<button
							type="button"
							onclick={reset}
							aria-label="Remove file"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<X class="h-4 w-4" />
						</button>
					</div>

					{#if previewHeaders.length > 0}
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<p class="text-xs font-medium text-muted-foreground">
									Preview{#if totalRows > previewRows.length}&nbsp;· first {previewRows.length} of {totalRows.toLocaleString()}
										rows{/if}
								</p>
								{#if previewHeaders.length > 4}
									<p class="text-xs text-muted-foreground/70">Scroll to see all columns →</p>
								{/if}
							</div>
							<!-- min-w-0 lets the wrapper actually scroll instead of stretching the modal -->
							<div
								class="min-w-0 max-h-64 overflow-auto rounded-xl border border-border/60 bg-card"
							>
								<table class="w-full border-collapse text-xs">
									<thead class="sticky top-0 z-10">
										<tr>
											{#each previewHeaders as h (h)}
												<th
													class="whitespace-nowrap border-b border-border/60 bg-muted/80 px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground backdrop-blur"
												>
													{h}
												</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										{#each previewRows as r, i (i)}
											<tr class={cn('transition-colors', i % 2 === 1 && 'bg-muted/30')}>
												{#each previewHeaders as _, j (j)}
													<td
														class="max-w-[180px] truncate whitespace-nowrap border-b border-border/40 px-3 py-2 text-foreground"
													>
														{r[j] ?? ''}
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}

					<!-- Column mapping hint: what we recognize vs silently drop -->
					{#if previewHeaders.length > 0 && (headerMapping.mapped.length > 0 || headerMapping.ignored.length > 0)}
						<div class="space-y-2 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
							{#if headerMapping.mapped.length > 0}
								<div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
									<span class="text-xs font-medium text-muted-foreground">Mapped:</span>
									{#each headerMapping.mapped as label (label)}
										<span
											class="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
										>
											{label}
										</span>
									{/each}
								</div>
							{/if}
							{#if headerMapping.ignored.length > 0}
								<div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
									<span class="text-xs font-medium text-amber-600 dark:text-amber-400">Ignored:</span>
									{#each headerMapping.ignored as h (h)}
										<span
											class="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
										>
											{h}
										</span>
									{/each}
									<span class="text-xs text-muted-foreground/70"
										>— {headerMapping.ignored.length === 1 ? 'this column' : 'these columns'} won't be
										imported</span
									>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Duplicate handling: a row matches an existing contact on phone OR email -->
					<div class="space-y-2">
						<p class="text-xs font-medium text-muted-foreground">If a contact already exists</p>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each [{ value: 'skip', title: 'Skip duplicates', desc: "Keep the existing contact as-is. Don't import the matching row." }, { value: 'update', title: 'Update existing', desc: 'Overwrite the existing contact with the values from your file.' }] as opt (opt.value)}
								<button
									type="button"
									onclick={() => (onDuplicate = opt.value as 'skip' | 'update')}
									class={cn(
										'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
										onDuplicate === opt.value
											? 'border-primary bg-primary/5 ring-1 ring-primary/30'
											: 'border-border/60 hover:bg-muted/40'
									)}
								>
									<span
										class={cn(
											'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
											onDuplicate === opt.value ? 'border-primary' : 'border-muted-foreground/40'
										)}
									>
										{#if onDuplicate === opt.value}
											<span class="h-2 w-2 rounded-full bg-primary"></span>
										{/if}
									</span>
									<span class="min-w-0">
										<span class="block text-sm font-medium text-foreground">{opt.title}</span>
										<span class="mt-0.5 block text-xs text-muted-foreground">{opt.desc}</span>
									</span>
								</button>
							{/each}
						</div>
					</div>
				</div>
			{:else if stage === 'uploading'}
				<div class="flex flex-col items-center gap-4 py-10">
					<div
						class="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary"
					></div>
					<p class="text-sm text-muted-foreground">Uploading file…</p>
				</div>
			{:else if stage === 'processing'}
				<div class="space-y-5 py-2">
					<div class="space-y-2.5">
						<div class="flex items-end justify-between">
							<div>
								<p class="text-sm font-medium text-foreground">
									{#if cancelling || progress?.status === 'cancelling'}
										Cancelling…
									{:else}
										Importing contacts…
									{/if}
								</p>
								<p class="text-xs text-muted-foreground">
									{(progress?.processed_rows ?? 0).toLocaleString()} of {(
										progress?.total_rows ?? totalRows
									).toLocaleString()} rows
								</p>
							</div>
							{#if indeterminate}
								<span class="text-sm font-medium text-muted-foreground">Working…</span>
							{:else}
								<span class="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
									{percent}%
								</span>
							{/if}
						</div>
						<div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
							{#if indeterminate}
								<div class="progress-indeterminate h-full w-full rounded-full"></div>
							{:else}
								<div
									class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
									style:width={`${percent}%`}
								></div>
							{/if}
						</div>
					</div>

					{@render statTiles(
						progress?.imported ?? 0,
						progress?.skipped ?? 0,
						progress?.failed ?? 0,
						progress?.updated ?? 0
					)}

					<p
						class="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground"
					>
						<CheckCircle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						You can safely close this window — the import keeps running and you can reopen it any time
						to check progress.
					</p>
				</div>
			{:else if stage === 'done' && progress}
				<div class="space-y-4">
					{#if finalStatus === 'failed'}
						<div
							class="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
						>
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10"
							>
								<AlertCircle class="h-5 w-5 text-destructive" />
							</div>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-destructive">Import failed</p>
								<p class="mt-0.5 text-sm text-muted-foreground">
									{progress.last_error ?? 'Something went wrong while importing.'}
									{#if progress.imported > 0}
										{progress.imported.toLocaleString()} contact{progress.imported !== 1
											? 's were'
											: ' was'} imported before it stopped.
									{/if}
								</p>
							</div>
						</div>
					{:else if finalStatus === 'cancelled'}
						<div
							class="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
						>
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10"
							>
								<Ban class="h-5 w-5 text-amber-600 dark:text-amber-400" />
							</div>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-amber-700 dark:text-amber-400">
									Import cancelled
								</p>
								<p class="mt-0.5 text-sm text-muted-foreground">
									Stopped at your request. Everything imported so far has been kept.
								</p>
							</div>
						</div>
					{:else}
						<div
							class="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
						>
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10"
							>
								<CheckCircle class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
							</div>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
									Import complete
								</p>
								<p class="mt-0.5 text-sm text-muted-foreground">
									Your contacts are now in your list.{#if progress.updated > 0}&nbsp;{progress.updated.toLocaleString()}
										existing contact{progress.updated !== 1 ? 's were' : ' was'} updated.{/if}{#if progress.skipped > 0}&nbsp;{progress.skipped.toLocaleString()}
										duplicate{progress.skipped !== 1 ? 's were' : ' was'} skipped (matched by phone or email).{/if}
								</p>
							</div>
						</div>
					{/if}

					{@render statTiles(progress.imported, progress.skipped, progress.failed, progress.updated)}

					{#if flaggedCount > 0 && importId}
						<div class="space-y-2">
							<p class="text-xs text-muted-foreground">
								{flaggedCount.toLocaleString()} row{flaggedCount !== 1 ? 's' : ''} need{flaggedCount ===
								1
									? 's'
									: ''} your attention (e.g. imported without a valid phone number).
							</p>
							<button
								type="button"
								onclick={downloadErrors}
								class="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<Download class="h-4 w-4 text-muted-foreground" />
								Download flagged rows ({flaggedCount.toLocaleString()})
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer class="border-t border-border/60 px-6 py-4">
			{#if stage === 'idle'}
				<Button variant="outline" onclick={handleClose}>Cancel</Button>
			{:else if stage === 'parsed'}
				<Button variant="outline" onclick={reset}>Back</Button>
				<Button onclick={runImport} disabled={!file || totalRows === 0}>
					Import {totalRows} contact{totalRows !== 1 ? 's' : ''}
				</Button>
			{:else if stage === 'uploading'}
				<Button variant="outline" disabled>Cancel</Button>
			{:else if stage === 'processing'}
				<Button variant="outline" onclick={handleClose}>Close</Button>
				<Button
					variant="destructive"
					onclick={cancelImport}
					disabled={cancelling || progress?.status === 'cancelling'}
				>
					{cancelling || progress?.status === 'cancelling' ? 'Cancelling…' : 'Cancel import'}
				</Button>
			{:else if stage === 'done'}
				<Button onclick={handleClose}>Done</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
