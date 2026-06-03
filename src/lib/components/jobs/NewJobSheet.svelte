<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { Search } from '@lucide/svelte';

	type Assignee = { id: string; full_name: string };
	type ContactHit = { id: string; full_name: string; phone: string };

	let {
		open = $bindable(),
		assignees,
		canEditAssignee,
		onClose
	}: {
		open: boolean;
		assignees: Assignee[];
		canEditAssignee: boolean;
		onClose: () => void;
	} = $props();

	let contactQuery = $state('');
	let contactResults = $state<ContactHit[]>([]);
	let selectedContact = $state<ContactHit | null>(null);
	let searching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	let title = $state('');
	let status = $state<'scheduled' | 'in_progress' | 'completed'>('scheduled');
	let assignedTo = $state('');
	let scheduledStart = $state('');
	let scheduledEnd = $state('');
	let scopeOfWork = $state('');
	let notes = $state('');

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	function reset() {
		contactQuery = '';
		contactResults = [];
		selectedContact = null;
		title = '';
		status = 'scheduled';
		assignedTo = '';
		scheduledStart = '';
		scheduledEnd = '';
		scopeOfWork = '';
		notes = '';
		errorMsg = null;
	}

	$effect(() => {
		if (!open) reset();
	});

	function onSearchInput(value: string) {
		contactQuery = value;
		if (searchTimer) clearTimeout(searchTimer);
		if (value.trim().length < 2) {
			contactResults = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/contacts?q=${encodeURIComponent(value.trim())}`);
				if (!res.ok) return;
				const body = (await res.json()) as { items: ContactHit[] };
				contactResults = body.items.slice(0, 8);
			} finally {
				searching = false;
			}
		}, 250);
	}

	function pickContact(c: ContactHit) {
		selectedContact = c;
		contactQuery = c.full_name;
		contactResults = [];
	}

	function clearContact() {
		selectedContact = null;
		contactQuery = '';
		contactResults = [];
	}

	async function save() {
		errorMsg = null;
		if (!selectedContact) {
			errorMsg = 'Please select a contact.';
			return;
		}
		if (!title.trim()) {
			errorMsg = 'Please enter a job title.';
			return;
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = {
				contact_id: selectedContact.id,
				title: title.trim(),
				status
			};
			if (canEditAssignee && assignedTo) payload.assigned_to = assignedTo;
			if (scheduledStart) payload.scheduled_start = new Date(scheduledStart).toISOString();
			if (scheduledEnd) payload.scheduled_end = new Date(scheduledEnd).toISOString();
			if (scopeOfWork.trim()) payload.scope_of_work = scopeOfWork.trim();
			if (notes.trim()) payload.notes = notes.trim();

			const res = await fetch('/api/jobs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not create job.';
				return;
			}
			open = false;
			await goto(`/jobs/${body.job.id}`);
		} catch {
			errorMsg = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<Sheet.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Sheet.Content side="bottom" class="max-h-[92vh] overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>New job</Sheet.Title>
		</Sheet.Header>

		<div class="mt-4 space-y-4">
			<div class="space-y-1.5">
				<Label for="nj-contact">Contact <span class="text-destructive">*</span></Label>
				{#if selectedContact}
					<div
						class="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{selectedContact.full_name}</p>
							<p class="truncate text-xs text-muted-foreground">{selectedContact.phone}</p>
						</div>
						<Button variant="ghost" size="sm" onclick={clearContact}>Change</Button>
					</div>
				{:else}
					<div class="relative">
						<Search
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="nj-contact"
							placeholder="Search by name or phone"
							value={contactQuery}
							oninput={(e) => onSearchInput((e.target as HTMLInputElement).value)}
							class="h-11 pl-9"
						/>
						{#if contactResults.length > 0}
							<ul
								class="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-dropdown"
							>
								{#each contactResults as c (c.id)}
									<li>
										<button
											type="button"
											class="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent/60"
											onclick={() => pickContact(c)}
										>
											<span class="text-sm font-medium">{c.full_name}</span>
											<span class="text-xs text-muted-foreground">{c.phone}</span>
										</button>
									</li>
								{/each}
							</ul>
						{:else if searching}
							<p class="mt-1 text-xs text-muted-foreground">Searching…</p>
						{/if}
					</div>
				{/if}
			</div>

			<div class="space-y-1.5">
				<Label for="nj-title">Job title <span class="text-destructive">*</span></Label>
				<Input
					id="nj-title"
					bind:value={title}
					placeholder="e.g. Bathroom faucet repair"
					class="h-11"
				/>
			</div>

			<div class="space-y-1.5">
				<Label for="nj-status">Status</Label>
				<Select.Root bind:value={status}>
					<Select.Trigger class="h-11 w-full">
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="scheduled">Scheduled</Select.Item>
						<Select.Item value="in_progress">In progress</Select.Item>
						<Select.Item value="completed">Completed</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>

			{#if canEditAssignee}
				<div class="space-y-1.5">
					<Label for="nj-assignee">Assigned to</Label>
					<Select.Root bind:value={assignedTo}>
						<Select.Trigger class="h-11 w-full">
							<Select.Value placeholder="Unassigned" />
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Unassigned</Select.Item>
							{#each assignees as a (a.id)}
								<Select.Item value={a.id}>{a.full_name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="nj-start">Scheduled start</Label>
					<DateTimePicker bind:value={scheduledStart} placeholder="Pick start date & time" />
				</div>
				<div class="space-y-1.5">
					<Label for="nj-end">Scheduled end</Label>
					<DateTimePicker bind:value={scheduledEnd} placeholder="Pick end date & time" />
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="nj-scope">Scope of work</Label>
				<Textarea id="nj-scope" bind:value={scopeOfWork} rows={4} />
			</div>

			<div class="space-y-1.5">
				<Label for="nj-notes">Notes</Label>
				<Textarea id="nj-notes" bind:value={notes} rows={3} />
			</div>

			{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}

			<div class="flex gap-2 pt-2">
				<Button variant="outline" class="flex-1" disabled={saving} onclick={() => (open = false)}>
					Cancel
				</Button>
				<JetEngineButton
					class="flex-1"
					label="Create job"
					loadingLabel="Creating…"
					successLabel="Created"
					state={saving ? 'loading' : 'idle'}
					onclick={save}
				/>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
