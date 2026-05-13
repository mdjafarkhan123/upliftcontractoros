<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Search, X } from '@lucide/svelte';

	type ContactHit = { id: string; full_name: string; phone: string };
	type Assignee = { id: string; full_name: string };

	type Props = {
		open: boolean;
		assignees: Assignee[];
		onClose: () => void;
		onCreated: (opportunityId: string) => void;
	};

	let { open = $bindable(), assignees, onClose, onCreated }: Props = $props();

	let title = $state('');
	let value = $state('');
	let assignedTo = $state<string>('');
	let selectedContact = $state<ContactHit | null>(null);
	let search = $state('');
	let hits = $state<ContactHit[]>([]);
	let searching = $state(false);
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	let lastQuery = '';
	$effect(() => {
		const q = search.trim();
		if (q === lastQuery) return;
		lastQuery = q;
		if (selectedContact || q.length < 2) {
			hits = [];
			return;
		}
		searching = true;
		const params = new URLSearchParams({ q });
		fetch(`/api/contacts?${params.toString()}`)
			.then((r) => (r.ok ? r.json() : Promise.reject()))
			.then((b: { items: ContactHit[] }) => {
				hits = b.items.slice(0, 6);
			})
			.catch(() => (hits = []))
			.finally(() => (searching = false));
	});

	function reset() {
		title = '';
		value = '';
		assignedTo = '';
		selectedContact = null;
		search = '';
		hits = [];
		errorMsg = null;
	}

	function close() {
		reset();
		onClose();
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMsg = null;
		if (!selectedContact) {
			errorMsg = 'Pick a contact first.';
			return;
		}
		if (!title.trim()) {
			errorMsg = 'Title is required.';
			return;
		}
		submitting = true;
		try {
			const res = await fetch('/api/pipeline/opportunities', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contact_id: selectedContact.id,
					title: title.trim(),
					value: value.trim() || null,
					assigned_to: assignedTo || null
				})
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not create opportunity.';
				submitting = false;
				return;
			}
			onCreated(body.opportunity.id);
			reset();
		} catch {
			errorMsg = 'Network error.';
		} finally {
			submitting = false;
		}
	}
</script>

<Sheet.Root bind:open onOpenChange={(o) => !o && reset()}>
	<Sheet.Content side="bottom" class="max-h-[90vh] overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>New opportunity</Sheet.Title>
		</Sheet.Header>

		<form class="mt-4 space-y-4" onsubmit={submit}>
			<div class="space-y-1.5">
				<Label for="opp-contact">Contact <span class="text-destructive">*</span></Label>
				{#if selectedContact}
					<div
						class="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2"
					>
						<div class="min-w-0">
							<div class="truncate text-sm font-medium">{selectedContact.full_name}</div>
							<div class="truncate text-xs text-muted-foreground">{selectedContact.phone}</div>
						</div>
						<button
							type="button"
							class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
							aria-label="Clear contact"
							onclick={() => {
								selectedContact = null;
								search = '';
							}}
						>
							<X class="h-4 w-4" />
						</button>
					</div>
				{:else}
					<div class="relative">
						<Search
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="opp-contact"
							class="pl-9"
							placeholder="Search by name or phone"
							bind:value={search}
							autocomplete="off"
						/>
					</div>
					{#if search.trim().length >= 2}
						<div class="rounded-lg border border-border bg-card">
							{#if searching}
								<div class="px-3 py-3 text-sm text-muted-foreground">Searching…</div>
							{:else if hits.length === 0}
								<div class="px-3 py-3 text-sm text-muted-foreground">No contacts found.</div>
							{:else}
								<ul>
									{#each hits as h (h.id)}
										<li>
											<button
												type="button"
												class="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-accent"
												onclick={() => {
													selectedContact = h;
													search = '';
													hits = [];
												}}
											>
												<span class="truncate text-sm font-medium">{h.full_name}</span>
												<span class="ml-3 truncate text-xs text-muted-foreground">{h.phone}</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<div class="space-y-1.5">
				<Label for="opp-title">Title <span class="text-destructive">*</span></Label>
				<Input
					id="opp-title"
					bind:value={title}
					placeholder="Roof replacement estimate"
					maxlength={200}
				/>
			</div>

			<div class="space-y-1.5">
				<Label for="opp-value">Estimated value</Label>
				<Input id="opp-value" bind:value type="text" inputmode="decimal" placeholder="0.00" />
			</div>

			<div class="space-y-1.5">
				<Label for="opp-assignee">Assign to</Label>
				<select
					id="opp-assignee"
					bind:value={assignedTo}
					class="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">Unassigned</option>
					{#each assignees as m (m.id)}
						<option value={m.id}>{m.full_name}</option>
					{/each}
				</select>
			</div>

			{#if errorMsg}
				<p class="text-sm text-destructive">{errorMsg}</p>
			{/if}

			<div class="flex gap-2 pt-2">
				<Button
					type="button"
					variant="outline"
					class="flex-1"
					onclick={close}
					disabled={submitting}
				>
					Cancel
				</Button>
				<Button type="submit" class="flex-1" disabled={submitting}>
					{submitting ? 'Creating…' : 'Create'}
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
