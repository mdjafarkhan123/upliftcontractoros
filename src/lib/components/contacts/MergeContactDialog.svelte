<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { toast } from '$lib/stores/toast.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatPhoneDisplay } from '$lib/utils/phone';

	type Candidate = {
		id: string;
		full_name: string;
		phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
	};

	let {
		open = $bindable(false),
		current,
		onMerged
	}: {
		open?: boolean;
		current: { id: string; full_name: string; phone: string | null };
		onMerged: (survivorId: string) => void;
	} = $props();

	let query = $state('');
	let results = $state<Candidate[]>([]);
	let searching = $state(false);
	let selected = $state<Candidate | null>(null);
	let survivorId = $state(current.id);
	let merging = $state(false);

	let debounce: ReturnType<typeof setTimeout> | null = null;

	function onInput(value: string) {
		query = value;
		if (debounce) clearTimeout(debounce);
		if (value.trim().length < 2) {
			results = [];
			return;
		}
		debounce = setTimeout(runSearch, 250);
	}

	async function runSearch() {
		searching = true;
		try {
			const res = await fetch(`/api/contacts?q=${encodeURIComponent(query.trim())}`);
			if (res.ok) {
				const body = (await res.json()) as { items: Candidate[] };
				results = body.items.filter((c) => c.id !== current.id);
			}
		} catch {
			toast.error('Search failed');
		} finally {
			searching = false;
		}
	}

	function pick(c: Candidate) {
		selected = c;
		survivorId = current.id;
	}

	function back() {
		selected = null;
	}

	const survivor = $derived(selected ? (survivorId === current.id ? current : selected) : null);
	const source = $derived(selected ? (survivorId === current.id ? selected : current) : null);

	async function confirmMerge() {
		if (!selected || merging) return;
		merging = true;
		try {
			const keptId = survivorId;
			const sourceId = keptId === current.id ? selected.id : current.id;
			const res = await fetch(`/api/contacts/${keptId}/merge`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ source_id: sourceId })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				toast.success('Contacts merged');
				open = false;
				reset();
				onMerged(keptId);
			} else {
				toast.error(body.error ?? 'Failed to merge contacts');
			}
		} finally {
			merging = false;
		}
	}

	function reset() {
		query = '';
		results = [];
		selected = null;
		survivorId = current.id;
	}

	$effect(() => {
		if (!open) reset();
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay" />
		<Dialog.Content class="dialog-content">
			<div class="dialog-content__header">
				<div>
					<h2 class="dialog-content__title">Merge duplicate</h2>
					<p class="dialog-content__description">
						{selected
							? 'Choose which record to keep. The other is archived and all its history moves over.'
							: 'Find the duplicate record to merge into this contact.'}
					</p>
				</div>
				<Dialog.Close class="dialog-content__close">
					<i class="ri-close-line contact-merge__close-icon" aria-hidden="true"></i>
				</Dialog.Close>
			</div>

			{#if !selected}
				<div class="contact-merge__step">
					<!-- Search input -->
					<div class="field">
						<div class="field__input-wrap">
							<i class="ri-search-line field__icon" aria-hidden="true"></i>
							<input
								class="field__input"
								placeholder="Search name, phone, or email"
								value={query}
								oninput={(e) => onInput(e.currentTarget.value)}
							/>
						</div>
					</div>

					{#if searching}
						<p class="contact-merge__note">Searching…</p>
					{:else if query.trim().length >= 2 && results.length === 0}
						<p class="contact-merge__note">No other contacts match.</p>
					{:else}
						<div class="contact-merge__results">
							{#each results as c (c.id)}
								<button type="button" class="contact-merge__result-btn" onclick={() => pick(c)}>
									<span class="contact-merge__result-btn-name">{c.full_name}</span>
									<span class="contact-merge__result-btn-phone">{formatPhoneDisplay(c.phone)}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div class="contact-merge__step">
					<button type="button" class="contact-merge__back" onclick={back}>
						<i class="ri-arrow-left-line" aria-hidden="true"></i> Pick a different contact
					</button>

					<div class="contact-merge__options">
						{#each [current, selected] as c (c.id)}
							<button
								type="button"
								onclick={() => (survivorId = c.id)}
								class="contact-merge__option-btn {survivorId === c.id
									? 'contact-merge__option-btn--selected'
									: ''}"
							>
								<div style="min-width:0;">
									<p class="contact-merge__option-name">{c.full_name}</p>
									<p class="contact-merge__option-phone">{formatPhoneDisplay(c.phone)}</p>
								</div>
								<span
									class="contact-merge__badge {survivorId === c.id
										? 'contact-merge__badge--keep'
										: 'contact-merge__badge--archive'}"
								>
									{survivorId === c.id ? 'Keep this' : 'Will be archived'}
								</span>
							</button>
						{/each}
					</div>

					<div class="contact-merge__warn">
						<i class="ri-alert-line" aria-hidden="true"></i>
						<div>
							<p>
								This can't be undone. All conversations, jobs, quotes, invoices, appointments,
								notes, and addresses move to the kept record.
							</p>
							{#if survivor && source && survivor.phone !== source.phone}
								<p>
									{source.full_name}'s number ({formatPhoneDisplay(source.phone)}) is kept on the
									merged contact as a secondary number.
								</p>
							{/if}
						</div>
					</div>

					<Button
						type="button"
						variant="default"
						style="width:100%;"
						loading={merging}
						loadingLabel="Merging…"
						onclick={confirmMerge}
					>
						Merge contacts
					</Button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.contact-merge {
		&__close-icon {
			font-size: $fs-body;
		}
		&__note {
			padding: 0 $space-1;
			font-size: $fs-body;
			color: var(--color-text-secondary);
		}
	}
</style>
