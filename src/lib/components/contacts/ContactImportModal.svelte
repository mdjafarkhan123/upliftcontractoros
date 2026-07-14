<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		SelectRoot,
		SelectTrigger,
		SelectValue,
		SelectContent,
		SelectItem
	} from '$lib/components/ui/select';
	import { toast } from '$lib/stores/toast.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createRealtimeManager, type RealtimeManager } from '$lib/stores/realtimeReconnect';
	import {
		CANONICAL_FIELDS,
		CANONICAL_FIELD_LABELS,
		guessCanonical
	} from '$lib/contacts/csvHeaders';

	// Sentinel value for the "Don't import" option — bits-ui Select values are strings,
	// so a real null can't be an option value; we translate to/from null at the edges.
	const NO_IMPORT = '__none__';

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

	type Stage = 'idle' | 'mapping' | 'parsed' | 'uploading' | 'processing' | 'done';

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
	// User's column mapping, aligned by index with previewHeaders. Each entry is a
	// canonical field name (e.g. 'phone') or null for "don't import". Seeded from the
	// auto-guess when a file is parsed; editable on the "Map columns" step.
	let columnMap = $state<(string | null)[]>([]);
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

	// Canonical fields currently assigned to some column — drives duplicate blocking
	// (a field already mapped elsewhere is disabled in every OTHER column's dropdown,
	// the HubSpot/Jobber pattern) and the Continue-gate below.
	const mappedSet = $derived(new Set(columnMap.filter((c): c is string => !!c)));
	// The importer needs a name and at least one way to reach the contact.
	const hasNameMapped = $derived(mappedSet.has('full_name') || mappedSet.has('first_name'));
	const hasContactMapped = $derived(mappedSet.has('phone') || mappedSet.has('email'));
	const canContinueMapping = $derived(hasNameMapped && hasContactMapped);

	// Review-step summary of the final mapping: friendly labels for mapped columns and
	// the original header text for columns the user chose not to import.
	const mappingSummary = $derived.by(() => {
		const mapped: string[] = [];
		const ignored: string[] = [];
		for (let i = 0; i < previewHeaders.length; i++) {
			const canonical = columnMap[i];
			if (canonical) mapped.push(CANONICAL_FIELD_LABELS[canonical] ?? canonical);
			else if (previewHeaders[i]?.trim()) ignored.push(previewHeaders[i]);
		}
		return { mapped, ignored };
	});

	function fieldLabel(canonical: string | null): string {
		if (!canonical) return "Don't import";
		return CANONICAL_FIELD_LABELS[canonical] ?? canonical;
	}

	function setColumn(i: number, value: string) {
		columnMap[i] = value === NO_IMPORT ? null : value;
	}

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
		columnMap = [];
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
		// Seed the mapping with the auto-guess, respecting "first column wins" so the
		// same field is never pre-assigned to two columns (duplicates block below).
		const used = new Set<string>();
		columnMap = previewHeaders.map((h) => {
			const g = guessCanonical(h);
			if (g && !used.has(g)) {
				used.add(g);
				return g;
			}
			return null;
		});
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
			stage = 'mapping';
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
			fd.append('column_map', JSON.stringify(columnMap));
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

	// Wizard steps for the header progress rail. mapping = Map, parsed = Review;
	// everything from upload onward (uploading/processing/done) sits on final Import.
	const STEPS = ['Upload', 'Map', 'Review', 'Import'];
	const currentStep = $derived(
		stage === 'idle' ? 0 : stage === 'mapping' ? 1 : stage === 'parsed' ? 2 : 3
	);

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
	<Dialog.Content class="contact-import__dialog">
		<Dialog.Header class="contact-import__header">
			<div class="contact-import__titles">
				<Dialog.Title><span class="contact-import__title">Import Contacts</span></Dialog.Title>
				<Dialog.Description>
					<span class="contact-import__desc">
						Upload a CSV and we'll import your contacts in the background.
					</span>
				</Dialog.Description>
			</div>

			<!-- Step rail -->
			<div class="contact-import__steps">
				{#each STEPS as label, i (label)}
					{@const state = stepState(i)}
					<div class="contact-import__step">
						<div
							class="contact-import__step-num"
							class:contact-import__step-num--done={state === 'done'}
							class:contact-import__step-num--active={state === 'active'}
						>
							{#if state === 'done'}
								<i class="ri-check-line" aria-hidden="true"></i>
							{:else}
								{i + 1}
							{/if}
						</div>
						<span
							class="contact-import__step-label"
							class:contact-import__step-label--active={state === 'active'}
						>
							{label}
						</span>
						{#if i < STEPS.length - 1}
							<div class="contact-import__step-line"></div>
						{/if}
					</div>
				{/each}
			</div>
		</Dialog.Header>

		<div class="contact-import__scroll">
			{#snippet statTiles(imported: number, skipped: number, failed: number, updated = 0)}
				<div class="contact-import__stats" class:contact-import__stats--4={updated > 0}>
					<div class="contact-import__stat">
						<p class="contact-import__stat-value">{imported.toLocaleString()}</p>
						<p class="contact-import__stat-label">Imported</p>
					</div>
					{#if updated > 0}
						<div class="contact-import__stat">
							<p class="contact-import__stat-value">{updated.toLocaleString()}</p>
							<p class="contact-import__stat-label">Updated</p>
						</div>
					{/if}
					<div class="contact-import__stat">
						<p class="contact-import__stat-value">{skipped.toLocaleString()}</p>
						<p class="contact-import__stat-label">Skipped</p>
					</div>
					<div class="contact-import__stat" class:contact-import__stat--danger={failed > 0}>
						<p
							class="contact-import__stat-value"
							class:contact-import__stat-value--danger={failed > 0}
						>
							{failed.toLocaleString()}
						</p>
						<p class="contact-import__stat-label">Failed</p>
					</div>
				</div>
			{/snippet}

			{#if stage === 'idle'}
				<!-- Drop zone -->
				<div
					role="button"
					tabindex="0"
					class="contact-import__dropzone"
					class:contact-import__dropzone--drag={dragging}
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
					<div class="contact-import__drop-icon">
						<i class="ri-upload-2-line" aria-hidden="true"></i>
					</div>
					<div>
						<p class="contact-import__drop-title">
							{dragging ? 'Drop to upload' : 'Drop your CSV here, or click to browse'}
						</p>
						<p class="contact-import__drop-hint">
							CSV files only · up to 10 MB · max 10,000 contacts
						</p>
					</div>
					<input
						id="csv-file-input"
						type="file"
						accept=".csv"
						class="contact-import__file-input"
						onchange={onFileInput}
					/>
				</div>

				<div class="contact-import__template-row">
					<button type="button" class="contact-import__link" onclick={downloadTemplate}>
						<i class="ri-download-line" aria-hidden="true"></i>
						Download template
					</button>
					<p class="contact-import__template-cols">
						Need columns? Name, Phone, Email, Status, Source, Tags, Notes
					</p>
				</div>
			{:else if stage === 'mapping'}
				<!-- Step 2: Map columns. Each uploaded column → a contact field (or skip). -->
				<div class="contact-import__stack">
					<div class="contact-import__file">
						<div class="contact-import__file-icon">
							<i class="ri-file-excel-2-line" aria-hidden="true"></i>
						</div>
						<div class="contact-import__file-body">
							<p class="contact-import__file-name">{file?.name}</p>
							<p class="contact-import__file-size">
								{totalRows.toLocaleString()} contact{totalRows !== 1 ? 's' : ''}
								{#if file}&nbsp;· {humanSize(file.size)}{/if}
							</p>
						</div>
						<button
							type="button"
							onclick={reset}
							aria-label="Remove file"
							class="contact-import__file-remove"
						>
							<i class="ri-close-line" aria-hidden="true"></i>
						</button>
					</div>

					<p class="contact-import__map-lead">
						Match each column from your file to a contact field. We've guessed where we can — change
						any that look wrong, or set columns you don't need to <em>Don't import</em>.
					</p>

					<div class="contact-import__maplist">
						<div class="contact-import__maplist-head">
							<span>Column in your file</span>
							<span>Import as</span>
						</div>
						{#each previewHeaders as header, i (i)}
							<div class="contact-import__maprow">
								<div class="contact-import__maprow-src">
									<span class="contact-import__maprow-name">{header || `Column ${i + 1}`}</span>
									{#if previewRows[0]?.[i]}
										<span class="contact-import__maprow-sample">e.g. {previewRows[0][i]}</span>
									{/if}
								</div>
								<div class="contact-import__maprow-field">
									<SelectRoot
										value={columnMap[i] ?? NO_IMPORT}
										onValueChange={(v) => setColumn(i, v)}
									>
										<SelectTrigger aria-label={`Map column ${header || i + 1}`}>
											<SelectValue>{fieldLabel(columnMap[i])}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_IMPORT} label="Don't import" />
											{#each CANONICAL_FIELDS as f (f.value)}
												<SelectItem
													value={f.value}
													label={f.label}
													disabled={mappedSet.has(f.value) && columnMap[i] !== f.value}
												/>
											{/each}
										</SelectContent>
									</SelectRoot>
								</div>
							</div>
						{/each}
					</div>

					<div
						class="contact-import__map-hint"
						class:contact-import__map-hint--ok={canContinueMapping}
					>
						{#if canContinueMapping}
							<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
							<span>A name and a way to reach each contact are mapped — you're good to continue.</span>
						{:else}
							<i class="ri-information-line" aria-hidden="true"></i>
							<span>
								Map a <strong>Name</strong> column and at least a
								<strong>Phone</strong> or <strong>Email</strong> to continue.
							</span>
						{/if}
					</div>
				</div>
			{:else if stage === 'parsed'}
				<!-- Step 3: Review — confirm the mapping summary + duplicate handling. -->
				<div class="contact-import__stack">
					{#if uploadError}
						<div class="contact-import__alert contact-import__alert--danger">
							<i class="ri-error-warning-line contact-import__alert-icon-danger" aria-hidden="true"></i>
							<div class="contact-import__alert-body">
								<p class="contact-import__alert-title contact-import__alert-icon-danger">
									Couldn't import this file
								</p>
								<p class="contact-import__alert-text">{uploadError}</p>
							</div>
						</div>
					{/if}
					<div class="contact-import__file">
						<div class="contact-import__file-icon">
							<i class="ri-file-excel-2-line" aria-hidden="true"></i>
						</div>
						<div class="contact-import__file-body">
							<p class="contact-import__file-name">{file?.name}</p>
							<p class="contact-import__file-size">
								{totalRows.toLocaleString()} contact{totalRows !== 1 ? 's' : ''}
								{#if file}&nbsp;· {humanSize(file.size)}{/if}
							</p>
						</div>
						<button
							type="button"
							onclick={reset}
							aria-label="Remove file"
							class="contact-import__file-remove"
						>
							<i class="ri-close-line" aria-hidden="true"></i>
						</button>
					</div>

					<!-- Mapping summary: the fields we'll import vs the columns being skipped -->
					{#if mappingSummary.mapped.length > 0 || mappingSummary.ignored.length > 0}
						<div class="contact-import__mapping">
							{#if mappingSummary.mapped.length > 0}
								<div class="contact-import__mapping-row">
									<span class="contact-import__mapping-label">Importing:</span>
									{#each mappingSummary.mapped as label (label)}
										<span class="contact-import__mapping-pill">{label}</span>
									{/each}
								</div>
							{/if}
							{#if mappingSummary.ignored.length > 0}
								<div class="contact-import__mapping-row">
									<span class="contact-import__mapping-label contact-import__mapping-label--warn">
										Skipping:
									</span>
									{#each mappingSummary.ignored as h (h)}
										<span class="contact-import__mapping-pill contact-import__mapping-pill--warn">
											{h}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Duplicate handling: a row matches an existing contact on phone OR email -->
					<div>
						<p class="contact-import__field-label">If a contact already exists</p>
						<div class="contact-import__dup-grid">
							{#each [{ value: 'skip', title: 'Skip duplicates', desc: "Keep the existing contact as-is. Don't import the matching row." }, { value: 'update', title: 'Update existing', desc: 'Overwrite the existing contact with the values from your file.' }] as opt (opt.value)}
								<button
									type="button"
									onclick={() => (onDuplicate = opt.value as 'skip' | 'update')}
									class="contact-import__dup-option"
									class:contact-import__dup-option--active={onDuplicate === opt.value}
								>
									<span class="contact-import__dup-radio">
										{#if onDuplicate === opt.value}<span></span>{/if}
									</span>
									<span>
										<span class="contact-import__dup-title">{opt.title}</span>
										<span class="contact-import__dup-desc">{opt.desc}</span>
									</span>
								</button>
							{/each}
						</div>
					</div>
				</div>
			{:else if stage === 'uploading'}
				<div class="contact-import__loading">
					<div class="contact-import__spinner"></div>
					<p class="contact-import__loading-text">Uploading file…</p>
				</div>
			{:else if stage === 'processing'}
				<div class="contact-import__progress">
					<div>
						<div class="contact-import__progress-head">
							<div>
								<p class="contact-import__progress-title">
									{#if cancelling || progress?.status === 'cancelling'}
										Cancelling…
									{:else}
										Importing contacts…
									{/if}
								</p>
								<p class="contact-import__progress-sub">
									{(progress?.processed_rows ?? 0).toLocaleString()} of {(
										progress?.total_rows ?? totalRows
									).toLocaleString()} rows
								</p>
							</div>
							{#if indeterminate}
								<span class="contact-import__progress-working">Working…</span>
							{:else}
								<span class="contact-import__progress-pct">{percent}%</span>
							{/if}
						</div>
						<div class="contact-import__bar">
							{#if indeterminate}
								<div class="progress-indeterminate contact-import__bar-fill" style:width="100%"></div>
							{:else}
								<div class="contact-import__bar-fill" style:width={`${percent}%`}></div>
							{/if}
						</div>
					</div>

					{@render statTiles(
						progress?.imported ?? 0,
						progress?.skipped ?? 0,
						progress?.failed ?? 0,
						progress?.updated ?? 0
					)}

					<p class="contact-import__note">
						<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
						You can safely close this window — the import keeps running and you can reopen it any time
						to check progress.
					</p>
				</div>
			{:else if stage === 'done' && progress}
				<div class="contact-import__stack">
					{#if finalStatus === 'failed'}
						<div class="contact-import__alert contact-import__alert--danger">
							<div class="contact-import__result-icon" style:background="var(--danger-bg)">
								<i class="ri-error-warning-line contact-import__alert-icon-danger" aria-hidden="true"></i>
							</div>
							<div class="contact-import__alert-body">
								<p class="contact-import__alert-title contact-import__alert-icon-danger">Import failed</p>
								<p class="contact-import__alert-text">
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
						<div class="contact-import__alert contact-import__alert--warn">
							<div class="contact-import__result-icon" style:background="var(--warning-bg)">
								<i class="ri-forbid-line contact-import__alert-icon-warn" aria-hidden="true"></i>
							</div>
							<div class="contact-import__alert-body">
								<p class="contact-import__alert-title contact-import__alert-icon-warn">Import cancelled</p>
								<p class="contact-import__alert-text">
									Stopped at your request. Everything imported so far has been kept.
								</p>
							</div>
						</div>
					{:else}
						<div class="contact-import__alert contact-import__alert--success">
							<div class="contact-import__result-icon" style:background="var(--success-bg)">
								<i class="ri-checkbox-circle-line contact-import__alert-icon-success" aria-hidden="true"></i>
							</div>
							<div class="contact-import__alert-body">
								<p class="contact-import__alert-title contact-import__alert-icon-success">
									Import complete
								</p>
								<p class="contact-import__alert-text">
									Your contacts are now in your list.{#if progress.updated > 0}&nbsp;{progress.updated.toLocaleString()}
										existing contact{progress.updated !== 1 ? 's were' : ' was'} updated.{/if}{#if progress.skipped > 0}&nbsp;{progress.skipped.toLocaleString()}
										duplicate{progress.skipped !== 1 ? 's were' : ' was'} skipped (matched by phone or email).{/if}
								</p>
							</div>
						</div>
					{/if}

					{@render statTiles(progress.imported, progress.skipped, progress.failed, progress.updated)}

					{#if flaggedCount > 0 && importId}
						<div class="contact-import__flag">
							<p class="contact-import__progress-sub">
								{flaggedCount.toLocaleString()} row{flaggedCount !== 1 ? 's' : ''} need{flaggedCount ===
								1
									? 's'
									: ''} your attention (e.g. imported without a valid phone number).
							</p>
							<Button type="button" variant="secondary" size="sm" onclick={downloadErrors}>
								<i class="ri-download-line" aria-hidden="true"></i>
								Download flagged rows ({flaggedCount.toLocaleString()})
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer class="contact-import__footer">
			{#if stage === 'idle'}
				<Button type="button" variant="secondary" onclick={handleClose}>Cancel</Button>
			{:else if stage === 'mapping'}
				<Button type="button" variant="secondary" onclick={reset}>Back</Button>
				<Button
					type="button"
					variant="default"
					onclick={() => (stage = 'parsed')}
					disabled={!canContinueMapping}
				>
					Continue
				</Button>
			{:else if stage === 'parsed'}
				<Button type="button" variant="secondary" onclick={() => (stage = 'mapping')}>
					Back
				</Button>
				<Button
					type="button"
					variant="default"
					onclick={runImport}
					disabled={!file || totalRows === 0}
				>
					Import {totalRows} contact{totalRows !== 1 ? 's' : ''}
				</Button>
			{:else if stage === 'uploading'}
				<Button type="button" variant="secondary" disabled>Cancel</Button>
			{:else if stage === 'processing'}
				<Button type="button" variant="secondary" onclick={handleClose}>Close</Button>
				<Button
					type="button"
					variant="destructive"
					onclick={cancelImport}
					disabled={cancelling || progress?.status === 'cancelling'}
				>
					{cancelling || progress?.status === 'cancelling' ? 'Cancelling…' : 'Cancel import'}
				</Button>
			{:else if stage === 'done'}
				<Button type="button" variant="default" onclick={handleClose}>Done</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
