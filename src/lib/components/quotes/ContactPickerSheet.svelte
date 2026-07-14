<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type ContactItem = { id: string; full_name: string; phone: string; email: string | null };

	let {
		open = $bindable(false),
		onPick
	}: {
		open?: boolean;
		onPick: (contact: ContactItem) => void;
	} = $props();

	let query = $state('');
	let items = $state<ContactItem[]>([]);
	let loading = $state(false);

	async function search() {
		loading = true;
		try {
			const params = new SvelteURLSearchParams();
			if (query.trim()) params.set('q', query.trim());
			const res = await fetch(`/api/contacts?${params.toString()}`);
			if (!res.ok) return;
			const body = (await res.json()) as { items: ContactItem[] };
			items = body.items;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) void search();
	});

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	function onQueryChange() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => void search(), 250);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom">
		<Sheet.Header class="dialog-sheet__header">
			<Sheet.Title class="dialog-sheet__title">Choose contact</Sheet.Title>
		</Sheet.Header>
		<div class="contact-picker">
			<div class="field__input-wrap">
				<i class="ri-search-line field__icon" aria-hidden="true"></i>
				<input
					class="field__input"
					bind:value={query}
					oninput={onQueryChange}
					placeholder="Search name or phone"
					autocomplete="off"
				/>
			</div>
			<div class="contact-picker__list">
				{#if loading}
					<p class="contact-picker__state">
						<i class="ri-loader-4-line animate-spin" aria-hidden="true"></i>
					</p>
				{:else if items.length === 0}
					<p class="contact-picker__state">No contacts found.</p>
				{:else}
					{#each items as c (c.id)}
						<button
							type="button"
							class="contact-picker__item"
							onclick={() => {
								onPick(c);
								open = false;
							}}
						>
							<span class="contact-picker__avatar">
								<i class="ri-user-line" aria-hidden="true"></i>
							</span>
							<span class="contact-picker__info">
								<span class="contact-picker__name">{c.full_name}</span>
								<span class="contact-picker__sub">
									{c.phone}{c.email ? ` · ${c.email}` : ''}
								</span>
								{#if !c.email}
									<span class="contact-picker__warn">
										<i class="ri-error-warning-line" aria-hidden="true"></i>No email
									</span>
								{/if}
							</span>
						</button>
					{/each}
				{/if}
			</div>
			<Button variant="outline" class="btn--full" onclick={() => (open = false)}>
				Cancel
			</Button>
		</div>
	</Sheet.Content>
</Sheet.Root>
