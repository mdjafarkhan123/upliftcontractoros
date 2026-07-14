<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/stores/toast.svelte';

	type Layout = 'side' | 'stacked';

	let {
		open = $bindable(false),
		beforeIds,
		afterIds,
		contactId = '',
		contactName = '',
		canSend = false
	}: {
		open?: boolean;
		beforeIds: string[];
		afterIds: string[];
		contactId?: string;
		contactName?: string;
		canSend?: boolean;
	} = $props();

	// The org's public Google review link — fetched lazily for the "Add review link"
	// insert. Null until loaded / when the org hasn't set one.
	let googleReviewLink = $state<string | null>(null);
	let reviewLinkLoaded = $state(false);

	let beforeId = $state<string | null>(null);
	let afterId = $state<string | null>(null);
	let layout = $state<Layout>('side');

	// Thumbnails for the pickers — fetched lazily, cached by media id.
	let thumbs = $state<Record<string, string>>({});

	// Preview state
	let previewUrl = $state<string | null>(null);
	let previewLoading = $state(false);
	let previewToken = 0;

	// Send state
	let message = $state('');
	let sending = $state(false);

	const firstName = $derived(contactName.trim().split(/\s+/)[0] ?? '');
	const bothPicked = $derived(Boolean(beforeId && afterId));

	function resetSelections() {
		beforeId = beforeIds.length === 1 ? beforeIds[0] : null;
		afterId = afterIds.length === 1 ? afterIds[0] : null;
		layout = 'side';
		clearPreview();
		message = firstName
			? `Hi ${firstName}, here's the before & after from your project — thank you for your business!`
			: `Here's the before & after from your project — thank you for your business!`;
	}

	function clearPreview() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
	}

	async function fetchThumb(id: string) {
		if (thumbs[id]) return;
		try {
			const res = await fetch(`/api/media/${id}/url?variant=thumbnail`);
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { url: string } };
			if (body.data?.url) thumbs = { ...thumbs, [id]: body.data.url };
		} catch {
			// silent — tile shows placeholder
		}
	}

	async function loadReviewLink() {
		if (reviewLinkLoaded || !canSend) return;
		reviewLinkLoaded = true;
		try {
			const res = await fetch('/api/org/review-link');
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { google_review_link: string | null } };
			googleReviewLink = body.data?.google_review_link ?? null;
		} catch {
			// silent — the button just won't show
		}
	}

	// On open, seed selections and load picker thumbnails + the review link.
	$effect(() => {
		if (!open) return;
		resetSelections();
		for (const id of [...beforeIds, ...afterIds]) void fetchThumb(id);
		void loadReviewLink();
	});

	// Regenerate the preview whenever both photos are chosen or the layout changes.
	$effect(() => {
		if (!open || !beforeId || !afterId) return;
		// Track deps explicitly
		const b = beforeId;
		const a = afterId;
		const l = layout;
		const token = ++previewToken;
		previewLoading = true;
		clearPreview();

		fetch('/api/media/before-after-export', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ before_id: b, after_id: a, layout: l, target: 'preview' })
		})
			.then(async (res) => {
				if (token !== previewToken) return; // a newer request superseded this one
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					toast.error(body.error ?? 'Could not build the image');
					return;
				}
				const blob = await res.blob();
				if (token !== previewToken) return;
				previewUrl = URL.createObjectURL(blob);
			})
			.catch(() => {
				if (token === previewToken) toast.error('Could not build the image');
			})
			.finally(() => {
				if (token === previewToken) previewLoading = false;
			});
	});

	function download() {
		if (!previewUrl) return;
		const a = document.createElement('a');
		a.href = previewUrl;
		a.download = 'before-after.jpg';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function insertReviewLink() {
		if (!googleReviewLink) return;
		const cta = `Love the result? Leave us a review: ${googleReviewLink}`;
		if (message.includes(googleReviewLink)) return;
		message = message.trim().length > 0 ? `${message.replace(/\s+$/, '')}\n\n${cta}` : cta;
	}

	async function sendToCustomer() {
		if (sending || !bothPicked || !canSend || !contactId) return;
		sending = true;
		let mediaId: string | null = null;
		try {
			// 1) Build + persist the composite as a sendable attachment.
			const exportRes = await fetch('/api/media/before-after-export', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					before_id: beforeId,
					after_id: afterId,
					layout,
					target: 'message'
				})
			});
			const exportBody = (await exportRes.json().catch(() => ({}))) as {
				data?: { media_id: string };
				error?: string;
			};
			if (!exportRes.ok || !exportBody.data) {
				toast.error(exportBody.error ?? 'Could not prepare the image');
				return;
			}
			mediaId = exportBody.data.media_id;

			// 2) Get (or reopen) the conversation for this customer.
			const startRes = await fetch('/api/conversations/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contact_id: contactId })
			});
			const startBody = (await startRes.json().catch(() => ({}))) as {
				data?: { conversation_id: string };
				error?: string;
			};
			if (!startRes.ok || !startBody.data) {
				toast.error(startBody.error ?? 'Could not start the conversation');
				return;
			}

			// 3) Send the picture message (MMS) through the standard send route —
			//    it handles SMS credits, opt-out, and delivery.
			const sendRes = await fetch(`/api/conversations/${startBody.data.conversation_id}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					body: message.trim(),
					channel: 'sms',
					media_ids: [mediaId]
				})
			});
			if (!sendRes.ok) {
				const body = (await sendRes.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Message not sent');
				return;
			}
			mediaId = null; // re-parented onto the message — no cleanup needed
			toast.success(`Sent to ${firstName || 'customer'}`);
			open = false;
		} catch {
			toast.error('Message not sent');
		} finally {
			// Clean up the orphaned attachment if we created one but never sent it.
			if (mediaId) void fetch(`/api/media/${mediaId}`, { method: 'DELETE' }).catch(() => {});
			sending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="ba-share">
		<Dialog.Header>
			<Dialog.Title>Share Before / After</Dialog.Title>
			<Dialog.Description>
				Pick one Before and one After photo to create a branded image.
			</Dialog.Description>
		</Dialog.Header>

		<div class="ba-share__body">
			<!-- Before picker -->
			<div class="ba-share__section">
				<span class="ba-share__label">Before</span>
				<div class="ba-share__picker">
					{#each beforeIds as id (id)}
						<button
							type="button"
							class="ba-share__thumb"
							class:ba-share__thumb--active={beforeId === id}
							onclick={() => (beforeId = id)}
							aria-label="Choose before photo"
						>
							{#if thumbs[id]}
								<img src={thumbs[id]} alt="Before option" class="ba-share__thumb-img" />
							{:else}
								<span class="ba-share__thumb-ph"
									><i class="ri-image-line" aria-hidden="true"></i></span
								>
							{/if}
							{#if beforeId === id}
								<span class="ba-share__thumb-check"
									><i class="ri-check-line" aria-hidden="true"></i></span
								>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- After picker -->
			<div class="ba-share__section">
				<span class="ba-share__label">After</span>
				<div class="ba-share__picker">
					{#each afterIds as id (id)}
						<button
							type="button"
							class="ba-share__thumb"
							class:ba-share__thumb--active={afterId === id}
							onclick={() => (afterId = id)}
							aria-label="Choose after photo"
						>
							{#if thumbs[id]}
								<img src={thumbs[id]} alt="After option" class="ba-share__thumb-img" />
							{:else}
								<span class="ba-share__thumb-ph"
									><i class="ri-image-line" aria-hidden="true"></i></span
								>
							{/if}
							{#if afterId === id}
								<span class="ba-share__thumb-check"
									><i class="ri-check-line" aria-hidden="true"></i></span
								>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- Layout toggle -->
			<div class="ba-share__section">
				<span class="ba-share__label">Layout</span>
				<div class="ba-share__layout">
					<button
						type="button"
						class="ba-share__layout-btn"
						class:ba-share__layout-btn--active={layout === 'side'}
						onclick={() => (layout = 'side')}
					>
						<i class="ri-layout-column-line" aria-hidden="true"></i> Side by side
					</button>
					<button
						type="button"
						class="ba-share__layout-btn"
						class:ba-share__layout-btn--active={layout === 'stacked'}
						onclick={() => (layout = 'stacked')}
					>
						<i class="ri-layout-row-line" aria-hidden="true"></i> Stacked
					</button>
				</div>
			</div>

			<!-- Preview -->
			<div class="ba-share__preview">
				{#if previewLoading}
					<div class="ba-share__preview-state">
						<i class="ri-loader-4-line ba-share__spin" aria-hidden="true"></i>
						<span>Building image…</span>
					</div>
				{:else if previewUrl}
					<img src={previewUrl} alt="Before and after preview" class="ba-share__preview-img" />
				{:else}
					<div class="ba-share__preview-state">
						<i class="ri-image-2-line" aria-hidden="true"></i>
						<span>Pick a Before and an After photo</span>
					</div>
				{/if}
			</div>

			<!-- Message to customer -->
			{#if canSend && contactId}
				<div class="ba-share__section">
					<span class="ba-share__label">Message to customer</span>
					<textarea
						bind:value={message}
						rows={3}
						class="ba-share__textarea"
						placeholder="Add a note…"
					></textarea>
					{#if googleReviewLink}
						<button type="button" class="ba-share__review-btn" onclick={insertReviewLink}>
							<i class="ri-star-line" aria-hidden="true"></i> Add review link
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<button
				type="button"
				class="ba-share__action ba-share__action--ghost"
				disabled={!previewUrl || previewLoading}
				onclick={download}
			>
				<i class="ri-download-2-line" aria-hidden="true"></i> Download
			</button>
			{#if canSend && contactId}
				<button
					type="button"
					class="ba-share__action ba-share__action--primary"
					disabled={!bothPicked || previewLoading || sending}
					onclick={sendToCustomer}
				>
					{#if sending}
						<i class="ri-loader-4-line ba-share__spin" aria-hidden="true"></i> Sending…
					{:else}
						<i class="ri-send-plane-fill" aria-hidden="true"></i> Text to customer
					{/if}
				</button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.ba-share__body {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		max-height: 60vh;
		overflow-y: auto;
		padding: $space-1 0;
	}

	.ba-share__section {
		display: flex;
		flex-direction: column;
		gap: $space-2;
	}

	.ba-share__label {
		font-size: $fs-body;
		font-weight: $weight-semibold;
		color: var(--color-text-secondary);
	}

	.ba-share__picker {
		display: flex;
		flex-wrap: wrap;
		gap: $space-2;
	}

	.ba-share__thumb {
		position: relative;
		width: 64px;
		height: 64px;
		padding: 0;
		border: 2px solid var(--color-border);
		border-radius: $radius-md;
		overflow: hidden;
		cursor: pointer;
		background: var(--color-bg-surface-sunk);
		transition: border-color $duration-fast $ease-standard;

		&--active {
			border-color: var(--color-brand);
		}
	}

	.ba-share__thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.ba-share__thumb-ph {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--color-text-secondary);
	}

	.ba-share__thumb-check {
		position: absolute;
		right: 2px;
		bottom: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: $radius-full;
		background: var(--color-brand);
		color: #fff;
		font-size: 0.85rem;
	}

	.ba-share__layout {
		display: flex;
		gap: $space-2;
	}

	.ba-share__layout-btn {
		display: inline-flex;
		align-items: center;
		gap: $space-1;
		padding: $space-2 $space-3;
		border: 1px solid var(--color-border);
		border-radius: $radius-full;
		background: var(--color-bg-surface);
		color: var(--color-text-secondary);
		font-size: $fs-body;
		font-weight: $weight-medium;
		cursor: pointer;
		transition: all $duration-fast $ease-standard;

		&--active {
			border-color: var(--color-brand);
			background: var(--color-brand);
			color: #fff;
		}
	}

	.ba-share__preview {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 180px;
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);
		overflow: hidden;
	}

	.ba-share__preview-img {
		max-width: 100%;
		max-height: 320px;
		display: block;
	}

	.ba-share__preview-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: $space-2;
		padding: $space-5;
		color: var(--color-text-secondary);
		font-size: $fs-body;

		i {
			font-size: 1.8rem;
		}
	}

	.ba-share__textarea {
		width: 100%;
		resize: vertical;
		padding: $space-3;
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-family: inherit;
	}

	.ba-share__review-btn {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: $space-1;
		padding: $space-1 $space-2;
		border: none;
		background: none;
		color: var(--color-brand);
		font-size: $fs-body;
		font-weight: $weight-medium;
		cursor: pointer;
	}

	.ba-share__action {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		padding: $space-2 $space-4;
		border-radius: $radius-full;
		font-size: $fs-body;
		font-weight: $weight-semibold;
		cursor: pointer;
		transition: all $duration-fast $ease-standard;

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		&--ghost {
			border: 1px solid var(--color-border);
			background: var(--color-bg-surface);
			color: var(--color-text-primary);
		}

		&--primary {
			border: 1px solid var(--color-brand);
			background: var(--color-brand);
			color: #fff;
		}
	}

	.ba-share__spin {
		animation: ba-spin 0.8s linear infinite;
	}

	@keyframes ba-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
