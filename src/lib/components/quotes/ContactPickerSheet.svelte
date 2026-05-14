<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Loader2, User } from '@lucide/svelte';
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
	<Sheet.Content side="bottom" class="max-h-[80vh]">
		<Sheet.Header>
			<Sheet.Title>Choose contact</Sheet.Title>
		</Sheet.Header>
		<div class="space-y-3 py-3">
			<Input bind:value={query} oninput={onQueryChange} placeholder="Search name or phone" autocomplete="off" />
			<div class="max-h-[55vh] space-y-2 overflow-y-auto">
				{#if loading}
					<div class="flex items-center justify-center py-6 text-muted-foreground">
						<Loader2 class="h-4 w-4 animate-spin" />
					</div>
				{:else if items.length === 0}
					<p class="py-6 text-center text-sm text-muted-foreground">No contacts found.</p>
				{:else}
					{#each items as c (c.id)}
						<button
							type="button"
							class="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
							onclick={() => {
								onPick(c);
								open = false;
							}}
						>
							<div class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<User class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{c.full_name}</p>
								<p class="truncate text-xs text-muted-foreground">{c.phone}</p>
							</div>
						</button>
					{/each}
				{/if}
			</div>
			<Button variant="outline" class="w-full" onclick={() => (open = false)}>Cancel</Button>
		</div>
	</Sheet.Content>
</Sheet.Root>
