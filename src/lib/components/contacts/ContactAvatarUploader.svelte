<script lang="ts">
	import ContactAvatar from './ContactAvatar.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		contactId,
		name,
		src = null,
		status = null,
		size = 64,
		onChange
	}: {
		contactId: string;
		name: string;
		src?: string | null;
		status?: 'lead' | 'customer' | 'archived' | null;
		/** Diameter of the avatar in px. */
		size?: number;
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
	class="contact-avatar-uploader"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.round(size * 0.4)}px"
	aria-label={src ? 'Change contact photo' : 'Add contact photo'}
>
	<ContactAvatar {name} src={displaySrc} {status} fill />

	<span
		class="contact-avatar-uploader__overlay"
		class:contact-avatar-uploader__overlay--busy={uploading}
	>
		{#if uploading}
			<i class="ri-loader-4-line contact-avatar-uploader__spin" aria-hidden="true"></i>
		{:else}
			<i class="ri-camera-line" aria-hidden="true"></i>
		{/if}
	</span>
</button>

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/webp"
	class="contact-avatar-uploader__input"
	onchange={onFileChange}
/>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-avatar-uploader {
		position: relative;
		display: block;
		padding: 0;
		border: none;
		border-radius: $radius-full;
		background: none;
		cursor: pointer;
		flex-shrink: 0;

		&:disabled {
			cursor: default;
		}

		&__overlay {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: $radius-full;
			background: rgba(0, 0, 0, 0.45);
			color: #fff;
			opacity: 0;
			transition: opacity $duration-fast $ease-standard;

			i {
				font-size: 1em;
			}

			&--busy {
				opacity: 1;
			}
		}

		&:hover &__overlay {
			opacity: 1;
		}

		&__spin {
			animation: spin 0.75s linear infinite;
		}

		&__input {
			display: none;
		}
	}
</style>
