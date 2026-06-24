<script lang="ts">
	import { Upload } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { LocalMediaItem } from './types';

	let {
		purposeTag,
		parentFk,
		label = 'Add photos',
		onUploaded,
		onOptimisticAdd,
		onOptimisticRemove,
		disabled = false
	}: {
		purposeTag: string;
		parentFk: {
			contact_id?: string;
			opportunity_id?: string;
			job_id?: string;
			quote_id?: string;
			invoice_id?: string;
		};
		label?: string;
		onUploaded: (item: LocalMediaItem) => void;
		onOptimisticAdd: (item: LocalMediaItem) => void;
		onOptimisticRemove: (localId: string) => void;
		disabled?: boolean;
	} = $props();

	let fileInput: HTMLInputElement | undefined = $state();

	function pickFile() {
		if (disabled) return;
		fileInput?.click();
	}

	function handleFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;
		for (const file of files) {
			void uploadFile(file);
		}
		// Reset so same file can be re-selected
		target.value = '';
	}

	async function uploadFile(file: File) {
		const localId = `opt-${Math.random().toString(36).slice(2)}`;

		// Optimistic preview — show immediately using local blob URL
		const previewUrl = URL.createObjectURL(file);
		const optimistic: LocalMediaItem = {
			localId,
			status: 'uploading',
			progress: 0,
			previewUrl,
			original_filename: file.name,
			file_size_bytes: file.size
		};
		onOptimisticAdd(optimistic);

		const doUpload = () => {
			return new Promise<{ data: LocalMediaItem }>((resolve, reject) => {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('purpose_tag', purposeTag);
				if (parentFk.contact_id) formData.append('contact_id', parentFk.contact_id);
				if (parentFk.opportunity_id) formData.append('opportunity_id', parentFk.opportunity_id);
				if (parentFk.job_id) formData.append('job_id', parentFk.job_id);
				if (parentFk.quote_id) formData.append('quote_id', parentFk.quote_id);
				if (parentFk.invoice_id) formData.append('invoice_id', parentFk.invoice_id);

				// Use XHR for reliable upload progress on mobile networks
				const xhr = new XMLHttpRequest();
				xhr.open('POST', '/api/media/upload');

				xhr.upload.onprogress = (ev) => {
					if (ev.lengthComputable) {
						const pct = (ev.loaded / ev.total) * 100;
						optimistic.progress = pct;
						// Trigger reactivity by updating the item in-place
						onOptimisticAdd({ ...optimistic, progress: pct });
					}
				};

				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						try {
							const body = JSON.parse(xhr.responseText) as { data: LocalMediaItem };
							resolve(body);
						} catch {
							reject(new Error('Invalid server response'));
						}
					} else {
						try {
							const body = JSON.parse(xhr.responseText) as { error?: string };
							reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
						} catch {
							reject(new Error(`Upload failed (${xhr.status})`));
						}
					}
				};

				xhr.onerror = () => reject(new Error('Network error'));
				xhr.ontimeout = () => reject(new Error('Upload timed out'));
				xhr.send(formData);
			});
		};

		try {
			const result = await doUpload();
			URL.revokeObjectURL(previewUrl);
			// Replace optimistic item with server record
			onOptimisticRemove(localId);
			onUploaded({
				...result.data,
				localId: result.data.id ?? localId,
				status: 'done',
				previewUrl: undefined
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Upload failed';
			toast.error(msg);
			// Mark as error with retry
			onOptimisticAdd({
				...optimistic,
				status: 'error',
				errorMsg: msg,
				retry: () => {
					onOptimisticRemove(localId);
					void uploadFile(file);
				}
			});
		}
	}
</script>

<button
	type="button"
	onclick={pickFile}
	{disabled}
	class="flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:border-primary/50 hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
>
	<Upload class="h-4 w-4" />
	{label}
</button>

<input
	bind:this={fileInput}
	type="file"
	multiple
	accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
	class="hidden"
	onchange={handleFileChange}
/>
