<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	type ContactHit = { id: string; full_name: string; phone: string };
	type Assignee = { id: string; full_name: string };

	type Props = {
		open: boolean;
		assignees: Assignee[];
		initialStageId?: string | null;
		onClose: () => void;
		onCreated: (opportunityId: string) => void;
	};

	let {
		open = $bindable(),
		assignees,
		initialStageId = null,
		onClose,
		onCreated
	}: Props = $props();

	let title = $state('');
	let value = $state('');
	let expectedCloseDate = $state('');
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
		expectedCloseDate = '';
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
					assigned_to: assignedTo || null,
					expected_close_date: expectedCloseDate || null,
					stage_id: initialStageId ?? undefined
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

		<form class="opp-sheet" onsubmit={submit}>
			<div>
				<Label for="opp-contact">Contact <span style="color: var(--danger-solid)">*</span></Label>
				{#if selectedContact}
					<div class="opp-sheet__selected-contact">
						<div class="opp-sheet__selected-info">
							<div class="opp-sheet__selected-name">{selectedContact.full_name}</div>
							<div class="opp-sheet__selected-phone">{selectedContact.phone}</div>
						</div>
						<button
							type="button"
							class="opp-sheet__clear-btn"
							aria-label="Clear contact"
							onclick={() => {
								selectedContact = null;
								search = '';
							}}
						>
							<i class="ri-close-line" aria-hidden="true"></i>
						</button>
					</div>
				{:else}
					<div class="opp-sheet__search-wrap">
						<span class="opp-sheet__search-icon">
							<i class="ri-search-line" aria-hidden="true"></i>
						</span>
						<Input
							id="opp-contact"
							style="padding-left: 36px;"
							placeholder="Search by name or phone"
							bind:value={search}
							autocomplete="off"
						/>
					</div>
					{#if search.trim().length >= 2}
						<div class="opp-sheet__hits">
							{#if searching}
								<div class="opp-sheet__hits-msg">Searching…</div>
							{:else if hits.length === 0}
								<div class="opp-sheet__hits-msg">No contacts found.</div>
							{:else}
								<ul style="list-style:none; padding:0; margin:0;">
									{#each hits as h (h.id)}
										<li>
											<button
												type="button"
												class="opp-sheet__hit-btn"
												onclick={() => {
													selectedContact = h;
													search = '';
													hits = [];
												}}
											>
												<span class="opp-sheet__hit-name">{h.full_name}</span>
												<span class="opp-sheet__hit-phone">{h.phone}</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<div>
				<Label for="opp-title">Title <span style="color: var(--danger-solid)">*</span></Label>
				<Input
					id="opp-title"
					bind:value={title}
					placeholder="Roof replacement estimate"
					maxlength={200}
				/>
			</div>

			<div class="opp-sheet__grid-2">
				<div>
					<Label for="opp-value">Estimated value</Label>
					<Input id="opp-value" bind:value type="text" inputmode="decimal" placeholder="0.00" />
				</div>
				<div>
					<Label for="opp-expected-close">Expected close</Label>
					<Input id="opp-expected-close" type="date" bind:value={expectedCloseDate} />
				</div>
			</div>

			<div>
				<Label for="opp-assignee">Assign to</Label>
				<Select.Root bind:value={assignedTo}>
					<Select.Trigger class="h-11 w-full">
						{assignees.find((m) => m.id === assignedTo)?.full_name ?? 'Unassigned'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">Unassigned</Select.Item>
						{#each assignees as m (m.id)}
							<Select.Item value={m.id}>{m.full_name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if errorMsg}
				<p class="opp-sheet__error">{errorMsg}</p>
			{/if}

			<div class="opp-sheet__actions">
				<Button
					type="button"
					variant="outline"
					style="flex:1;"
					onclick={close}
					disabled={submitting}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					style="flex:1;"
					loadingLabel="Creating…"
					successLabel="Created"
					loading={submitting}
				>
					Create
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
