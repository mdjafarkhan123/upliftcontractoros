<script lang="ts">
	import { Camera, Loader2 } from '@lucide/svelte';
	import ContactAvatar from './ContactAvatar.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';

	let {
		contactId,
		name,
		src = null,
		status = null,
		class: className,
		onChange
	}: {
		contactId: string;
		name: string;
		src?: string | null;
		status?: 'lead' | 'customer' | 'archived' | null;
		/** Sizing utilities for the avatar, e.g. "h-16 w-16 text-xl". */
		class?: string;
		/** Fires after a successful upload/remove with the fresh photo URL and the
		 * contact's new updated_at (so callers can refresh their concurrency token). */
		onChange: (result: { avatar_url: string | null; updated_at: string }) => void;
	} = $props();

	const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
	const MAX_BYTES = 5 * 1024 * 1024;

	let fileInput = $state<HTMLInputElement>();
	let previewUrl = $state<string | null>(null);
	let uploading = $state(false);

	const displaySrc = $derived(previewUrl ?? src);

	function pick() {
		if (!uploading) fileInput?.click();
	}

	function onFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (file) void upload(file);
	}

	function uploadMedia(file: File): Promise<{ id: string }> {
		return new Promise((resolve, reject) => {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('purpose_tag', 'contact_avatar');
			fd.append('contact_id', contactId);

			const xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/media/upload');
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
			toast.error('Photo must be a JPEG, PNG, or WebP image.');
			return;
		}
		if (file.size > MAX_BYTES) {
			toast.error('Photo exceeds 5 MB maximum.');
			return;
		}

		const localPreview = URL.createObjectURL(file);
		previewUrl = localPreview;
		uploading = true;

		try {
			const mediaRow = await uploadMedia(file);
			const res = await fetch(`/api/contacts/${contactId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ avatar_url: mediaRow.id })
			});
			const body = (await res.json().catch(() => ({}))) as {
				contact?: { avatar_url: string | null; updated_at: string };
				error?: string;
			};
			if (!res.ok || !body.contact) {
				toast.error(body.error ?? 'Failed to save photo');
				previewUrl = null;
				return;
			}
			onChange({ avatar_url: body.contact.avatar_url, updated_at: body.contact.updated_at });
			toast.success('Photo updated');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Upload failed');
			previewUrl = null;
		} finally {
			URL.revokeObjectURL(localPreview);
			previewUrl = null;
			uploading = false;
		}
	}
</script>

<button
	type="button"
	onclick={pick}
	disabled={uploading}
	class={cn(
		'group relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
		className
	)}
	aria-label={src ? 'Change contact photo' : 'Add contact photo'}
>
	<ContactAvatar {name} src={displaySrc} {status} class="h-full w-full ring-2" />

	{#if uploading}
		<span class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
			<Loader2 class="h-2/5 w-2/5 animate-spin text-white" />
		</span>
	{:else}
		<span
			class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
		>
			<Camera class="h-2/5 w-2/5 text-white" />
		</span>
	{/if}
</button>

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/webp"
	class="hidden"
	onchange={onFileChange}
/>
