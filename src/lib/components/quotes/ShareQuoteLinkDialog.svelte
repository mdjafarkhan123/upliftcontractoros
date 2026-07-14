<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		open = $bindable(false),
		quoteId,
		status,
		onActivated
	}: {
		open?: boolean;
		quoteId: string;
		status: string;
		/** Fired after a draft was activated by sharing, so the parent can refresh. */
		onActivated?: () => void;
	} = $props();

	let url = $state<string | null>(null);
	let loading = $state(false);
	let errorMsg = $state<string | null>(null);
	let copied = $state(false);

	const wasDraft = $derived(status === 'draft');

	// Fetch (and, for a draft, activate) the link once per open.
	let fetched = $state(false);
	$effect(() => {
		if (open && !fetched) {
			fetched = true;
			void load();
		} else if (!open && fetched) {
			fetched = false;
			url = null;
			errorMsg = null;
			copied = false;
		}
	});

	async function load() {
		loading = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/quotes/${quoteId}/share-link`, { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not get the link';
				return;
			}
			url = body.data.url;
			if (wasDraft) onActivated?.();
		} catch {
			errorMsg = 'Network error';
		} finally {
			loading = false;
		}
	}

	async function copy() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			toast.success('Link copied');
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error('Could not copy');
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="share-link" showClose={false}>
		<div class="dialog-content__header">
			<div class="dialog-content__header-main">
				<Dialog.Title>Copy client link</Dialog.Title>
				<Dialog.Description>
					Share this anywhere — text, WhatsApp, email, or read it out over the phone. Your customer
					opens the quote with no login needed.
				</Dialog.Description>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="share-link__body">
			{#if loading}
				<p class="share-link__status">
					<i class="ri-loader-4-line share-link__spin" aria-hidden="true"></i> Getting your link…
				</p>
			{:else if errorMsg}
				<p class="share-link__error">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					{errorMsg}
				</p>
			{:else if url}
				{#if wasDraft}
					<p class="share-link__note">
						<i class="ri-information-line" aria-hidden="true"></i>
						<span>
							This makes your quote viewable and moves it to <strong>Sent</strong>. No automatic
							messages go out — you're sharing it yourself.
						</span>
					</p>
				{/if}
				<div class="share-link__row">
					<Input value={url} readonly class="share-link__url" />
					<button type="button" class="share-link__copy" onclick={copy} aria-label="Copy link">
						<i class={copied ? 'ri-check-line' : 'ri-file-copy-line'} aria-hidden="true"></i>
					</button>
				</div>
				<a href={url} target="_blank" rel="noopener" class="share-link__open">
					<i class="ri-external-link-line" aria-hidden="true"></i> Open as customer
				</a>
			{/if}
		</div>

		<div class="dialog-content__footer">
			<Button variant="ghost" onclick={() => (open = false)}>Close</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
