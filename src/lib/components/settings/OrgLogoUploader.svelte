<script lang="ts">
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

<div class="logo-uploader">
	<div class="logo-uploader__row">
		<div class="logo-uploader__preview">
			{#if displayUrl}
				<img class="logo-uploader__img" src={displayUrl} alt="Organization {noun}" />
			{:else}
				<span class="logo-uploader__empty">No {noun}</span>
			{/if}
			{#if uploading}
				<div class="logo-uploader__spinner">
					<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
				</div>
			{/if}
		</div>

		<div class="logo-uploader__main">
			<div class="logo-uploader__actions">
				<Button variant="secondary" size="sm" disabled={busy} onclick={pickFile}>
					<i class="ri-upload-2-line" aria-hidden="true"></i>
					{currentLogoUrl ? `Replace ${noun}` : `Upload ${noun}`}
				</Button>
				{#if currentLogoUrl && !uploading}
				<Button variant="ghost" size="sm" disabled={busy} loading={removing} loadingLabel="Removing…" onclick={remove}>
					<i class="ri-delete-bin-line" aria-hidden="true"></i>
					Remove
				</Button>
				{/if}
			</div>
			<p class="logo-uploader__help">{helpText}</p>
			{#if uploading}
				<div class="logo-uploader__bar">
					<div class="logo-uploader__fill" style:width="{progress}%"></div>
				</div>
			{/if}
		</div>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		hidden
		onchange={onFileChange}
	/>
</div>
