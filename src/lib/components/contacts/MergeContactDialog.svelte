<script lang="ts">
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { cn } from '$lib/utils/cn';
	import { Search, ArrowLeft, AlertTriangle } from '@lucide/svelte';

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
	// Which record survives. Defaults to the contact you're viewing.
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

	// Reset transient state whenever the sheet is closed.
	$effect(() => {
		if (!open) reset();
	});
</script>

<BottomSheet
	bind:open
	title="Merge duplicate"
	description={selected
		? 'Choose which record to keep. The other is archived and all its history moves over.'
		: 'Find the duplicate record to merge into this contact.'}
>
	{#if !selected}
		<div class="mt-2 space-y-3 pb-2">
			<div class="relative">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					class="pl-9"
					placeholder="Search name, phone, or email"
					value={query}
					oninput={(e) => onInput(e.currentTarget.value)}
				/>
			</div>

			{#if searching}
				<p class="px-1 text-sm text-muted-foreground">Searching…</p>
			{:else if query.trim().length >= 2 && results.length === 0}
				<p class="px-1 text-sm text-muted-foreground">No other contacts match.</p>
			{:else}
				<ul class="space-y-1">
					{#each results as c (c.id)}
						<li>
							<button
								type="button"
								class="flex min-h-[44px] w-full flex-col items-start rounded-lg border border-border px-3 py-2 text-left hover:bg-muted"
								onclick={() => pick(c)}
							>
								<span class="text-sm font-medium">{c.full_name}</span>
								<span class="text-xs text-muted-foreground">{formatPhoneDisplay(c.phone)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<div class="mt-2 space-y-4 pb-2">
			<button
				type="button"
				class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				onclick={back}
			>
				<ArrowLeft class="h-4 w-4" /> Pick a different contact
			</button>

			<div class="grid grid-cols-1 gap-2">
				{#each [current, selected] as c (c.id)}
					<button
						type="button"
						onclick={() => (survivorId = c.id)}
						class={cn(
							'flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors',
							survivorId === c.id ? 'border-primary bg-primary/5' : 'border-border'
						)}
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold">{c.full_name}</p>
							<p class="truncate text-xs text-muted-foreground">{formatPhoneDisplay(c.phone)}</p>
						</div>
						<span
							class={cn(
								'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
								survivorId === c.id
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground'
							)}
						>
							{survivorId === c.id ? 'Keep this' : 'Will be archived'}
						</span>
					</button>
				{/each}
			</div>

			<div
				class="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
			>
				<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
				<div class="space-y-1">
					<p>
						This can't be undone. All conversations, jobs, quotes, invoices, appointments, notes,
						and addresses move to the kept record.
					</p>
					{#if survivor && source && survivor.phone !== source.phone}
						<p>
							{source.full_name}'s number ({formatPhoneDisplay(source.phone)}) is kept on the merged
							contact as a secondary number.
						</p>
					{/if}
				</div>
			</div>

			<Button class="w-full" disabled={merging} onclick={confirmMerge}>
				{merging ? 'Merging…' : 'Merge contacts'}
			</Button>
		</div>
	{/if}
</BottomSheet>
