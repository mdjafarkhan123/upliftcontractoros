<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
	import { Upload, FileText, CheckCircle, AlertCircle, X } from '@lucide/svelte';

	type ImportResult = {
		imported: number;
		skipped: number;
		errors: Array<{ row: number; reason: string }>;
	};

	type Stage = 'idle' | 'parsed' | 'importing' | 'done';

	let {
		open = $bindable(false),
		onDone
	}: { open?: boolean; onDone: () => void } = $props();

	let stage = $state<Stage>('idle');
	let dragging = $state(false);
	let file = $state<File | null>(null);
	let previewHeaders = $state<string[]>([]);
	let previewRows = $state<string[][]>([]);
	let totalRows = $state(0);
	let result = $state<ImportResult | null>(null);

	function reset() {
		stage = 'idle';
		dragging = false;
		file = null;
		previewHeaders = [];
		previewRows = [];
		totalRows = 0;
		result = null;
	}

	function handleClose() {
		open = false;
		setTimeout(reset, 250);
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
		if (f.size > 5 * 1024 * 1024) {
			toast.error('File too large. Maximum 5 MB.');
			return;
		}
		file = f;
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
		stage = 'importing';
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/contacts/import', { method: 'POST', body: fd });
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'Import failed');
			result = body.data as ImportResult;
			stage = 'done';
			if (result.imported > 0) onDone();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Import failed');
			stage = 'parsed';
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

	const visibleCols = $derived(Math.min(previewHeaders.length, 5));
	const extraCols = $derived(previewHeaders.length - visibleCols);
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) handleClose();
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Import Contacts</Dialog.Title>
			<Dialog.Description>Upload a CSV file to bulk-import contacts.</Dialog.Description>
		</Dialog.Header>

		<div class="py-2">
			{#if stage === 'idle'}
				<!-- Drop zone -->
				<div
					role="button"
					tabindex="0"
					class={cn(
						'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
						dragging
							? 'border-primary bg-primary/5'
							: 'border-border hover:border-primary/40 hover:bg-muted/40'
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
					<div class="rounded-full bg-muted p-3">
						<Upload class="h-6 w-6 text-muted-foreground" />
					</div>
					<div>
						<p class="text-sm font-medium">Drop your CSV here</p>
						<p class="mt-0.5 text-xs text-muted-foreground">or click to browse · max 5 MB · 2 000 rows</p>
					</div>
					<input
						id="csv-file-input"
						type="file"
						accept=".csv"
						class="sr-only"
						onchange={onFileInput}
					/>
				</div>

				<button
					type="button"
					class="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline"
					onclick={downloadTemplate}
				>
					<FileText class="h-4 w-4" />
					Download template CSV
				</button>
			{:else if stage === 'parsed'}
				<!-- File info + preview -->
				<div class="space-y-3">
					<div class="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
						<div class="flex min-w-0 items-center gap-2">
							<FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
							<span class="truncate text-sm font-medium">{file?.name}</span>
						</div>
						<button
							type="button"
							onclick={reset}
							aria-label="Remove file"
							class="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
						>
							<X class="h-4 w-4" />
						</button>
					</div>

					<p class="text-sm text-muted-foreground">
						{totalRows} row{totalRows !== 1 ? 's' : ''} detected
						{#if totalRows > 5}&nbsp;· showing first 5{/if}
					</p>

					{#if previewHeaders.length > 0}
						<div class="overflow-x-auto rounded-lg border">
							<table class="w-full text-xs">
								<thead>
									<tr class="bg-muted/60">
										{#each previewHeaders.slice(0, visibleCols) as h (h)}
											<th class="whitespace-nowrap px-2.5 py-2 text-left font-medium text-muted-foreground">
												{h}
											</th>
										{/each}
										{#if extraCols > 0}
											<th class="px-2.5 py-2 text-left font-medium text-muted-foreground">
												+{extraCols} more
											</th>
										{/if}
									</tr>
								</thead>
								<tbody>
									{#each previewRows as r, i (i)}
										<tr class="border-t border-border/50">
											{#each previewHeaders.slice(0, visibleCols).map((_, idx) => r[idx] ?? '') as cell, j (j)}
												<td class="max-w-[110px] truncate px-2.5 py-1.5 text-foreground">{cell}</td>
											{/each}
											{#if extraCols > 0}
												<td class="px-2.5 py-1.5 text-muted-foreground">…</td>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{:else if stage === 'importing'}
				<div class="flex flex-col items-center gap-4 py-10">
					<div class="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary"></div>
					<p class="text-sm text-muted-foreground">Importing contacts…</p>
				</div>
			{:else if stage === 'done' && result}
				<div class="space-y-4">
					<div class="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-4">
						<CheckCircle class="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
						<div>
							<p class="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
								Import complete
							</p>
							<p class="mt-0.5 text-sm text-muted-foreground">
								<span class="font-medium text-foreground">{result.imported}</span> imported ·
								<span class="font-medium text-foreground">{result.skipped}</span> skipped (duplicate
								phone)
							</p>
						</div>
					</div>

					{#if result.errors.length > 0}
						<div>
							<p class="mb-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
								<AlertCircle class="h-4 w-4" />
								{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} could not be imported
							</p>
							<ul class="max-h-36 space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
								{#each result.errors as err (err.row)}
									<li><span class="font-medium text-foreground">Row {err.row}:</span> {err.reason}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			{#if stage === 'idle'}
				<Button variant="outline" onclick={handleClose}>Cancel</Button>
			{:else if stage === 'parsed'}
				<Button variant="outline" onclick={reset}>Back</Button>
				<Button onclick={runImport} disabled={!file || totalRows === 0}>
					Import {totalRows} contact{totalRows !== 1 ? 's' : ''}
				</Button>
			{:else if stage === 'importing'}
				<Button variant="outline" disabled>Cancel</Button>
			{:else if stage === 'done'}
				<Button onclick={handleClose}>Done</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
