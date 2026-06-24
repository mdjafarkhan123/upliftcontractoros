<script lang="ts">
	import { Upload, Trash2, Loader2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';

	let {
		currentLogoUrl,
		onChange,
		purposeTag = 'org_logo',
		fieldKey = 'logo_url',
		noun = 'logo',
		helpText = 'JPEG, PNG, or WebP. Up to 5 MB. Square images render best.'
	}: {
		currentLogoUrl: string | null;
		onChange: (nextLogoUrl: string | null) => void;
		/** Media purpose tag — drives the upload route's org-asset handling. */
		purposeTag?: 'org_logo' | 'org_signature';
		/** The organizations column this image is saved to via /api/settings/org. */
		fieldKey?: 'logo_url' | 'signature_image_url';
		/** Lowercase noun used in buttons/toasts (e.g. "logo", "signature"). */
		noun?: string;
		helpText?: string;
	} = $props();

	let nounTitle = $derived(noun.charAt(0).toUpperCase() + noun.slice(1));

	const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
	const MAX_BYTES = 5 * 1024 * 1024;

	let fileInput: HTMLInputElement | undefined = $state();
	let previewUrl: string | null = $state(null);
	let progress = $state(0);
	let uploading = $state(false);
	let removing = $state(false);
	let busy = $derived(uploading || removing);

	let displayUrl = $derived(previewUrl ?? currentLogoUrl);

	function pickFile() {
		if (busy) return;
		fileInput?.click();
	}

	function onFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (!file) return;
		void upload(file);
	}

	function uploadMedia(file: File): Promise<{ id: string }> {
		return new Promise((resolve, reject) => {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('purpose_tag', purposeTag);

			const xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/media/upload');
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable) progress = (ev.loaded / ev.total) * 100;
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const body = JSON.parse(xhr.responseText) as { data: { id: string } };
						resolve(body.data);
					} catch {
						reject(new Error('Invalid server response'));
					}
				} else {
					let msg = `Upload failed (${xhr.status})`;
					try {
						const body = JSON.parse(xhr.responseText) as { error?: string };
						if (body.error) msg = body.error;
					} catch {
						/* ignore */
					}
					reject(new Error(msg));
				}
			};
			xhr.onerror = () => reject(new Error('Network error'));
			xhr.send(fd);
		});
	}

	async function upload(file: File) {
		if (!ALLOWED_MIME.includes(file.type)) {
			toast.error(`${nounTitle} must be a JPEG, PNG, or WebP image.`);
			return;
		}
		if (file.size > MAX_BYTES) {
			toast.error(`${nounTitle} exceeds 5 MB maximum.`);
			return;
		}

		const localPreview = URL.createObjectURL(file);
		previewUrl = localPreview;
		progress = 0;
		uploading = true;

		try {
			const mediaRow = await uploadMedia(file);
			const res = await fetch('/api/settings/org', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [fieldKey]: mediaRow.id })
			});
			const body = (await res.json()) as {
				data?: Record<string, string | null>;
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok || !body.data) {
				toast.error(body.error ?? body.field_errors?.[fieldKey] ?? `Failed to save ${noun}`);
				previewUrl = null;
				return;
			}
			onChange(body.data[fieldKey] ?? null);
			// The logo also appears in the app shell (sidebar/header) via the session.
			if (purposeTag === 'org_logo') void sessionStore.load(true);
			toast.success(`${nounTitle} updated`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Upload failed');
			previewUrl = null;
		} finally {
			URL.revokeObjectURL(localPreview);
			previewUrl = null;
			uploading = false;
			progress = 0;
		}
	}

	async function remove() {
		if (busy) return;
		removing = true;
		try {
			const res = await fetch('/api/settings/org', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [fieldKey]: null })
			});
			const body = (await res.json()) as {
				data?: Record<string, string | null>;
				error?: string;
			};
			if (!res.ok || !body.data) {
				toast.error(body.error ?? `Failed to remove ${noun}`);
				return;
			}
			onChange(null);
			if (purposeTag === 'org_logo') void sessionStore.load(true);
			toast.success(`${nounTitle} removed`);
		} catch {
			toast.error(`Failed to remove ${noun}`);
		} finally {
			removing = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-start gap-4">
		<div
			class="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40"
		>
			{#if displayUrl}
				<img
					src={displayUrl}
					alt="Organization {noun}"
					class="h-full w-full object-contain p-1.5"
				/>
			{:else}
				<span class="text-[10px] uppercase tracking-wide text-muted-foreground">No {noun}</span>
			{/if}
			{#if uploading}
				<div class="absolute inset-0 flex items-center justify-center bg-background/70">
					<Loader2 class="h-5 w-5 animate-spin text-primary" />
				</div>
			{/if}
		</div>

		<div class="flex flex-1 flex-col gap-2">
			<div class="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={pickFile}
					disabled={busy}
					class="min-h-[44px]"
				>
					<Upload class="mr-1.5 h-4 w-4" />
					{currentLogoUrl ? `Replace ${noun}` : `Upload ${noun}`}
				</Button>
				{#if currentLogoUrl && !uploading}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={remove}
						disabled={busy}
						class="min-h-[44px] text-destructive hover:text-destructive"
					>
						<Trash2 class="mr-1.5 h-4 w-4" />
						{removing ? 'Removing…' : 'Remove'}
					</Button>
				{/if}
			</div>
			<p class="text-xs text-muted-foreground">{helpText}</p>
			{#if uploading}
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-primary transition-[width] duration-150"
						style:width="{progress}%"
					></div>
				</div>
			{/if}
		</div>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		class="hidden"
		onchange={onFileChange}
	/>
</div>
