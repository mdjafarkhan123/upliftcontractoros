<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { JobDetail } from '$lib/types/jobs';

	type Assignee = { id: string; full_name: string };

	let {
		open = $bindable(),
		job,
		assignees,
		canEditAssignee,
		onClose,
		onSaved
	}: {
		open: boolean;
		job: JobDetail;
		assignees: Assignee[];
		canEditAssignee: boolean;
		onClose: () => void;
		onSaved: (next: JobDetail) => void;
	} = $props();

	function toInputValue(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	let assignedTo = $state(job.assigned_to ?? '');
	let scheduledStart = $state(toInputValue(job.scheduled_start));
	let scheduledEnd = $state(toInputValue(job.scheduled_end));
	let notes = $state(job.notes ?? '');
	let scopeOfWork = $state(job.scope_of_work ?? '');

	$effect(() => {
		assignedTo = job.assigned_to ?? '';
		scheduledStart = toInputValue(job.scheduled_start);
		scheduledEnd = toInputValue(job.scheduled_end);
		notes = job.notes ?? '';
		scopeOfWork = job.scope_of_work ?? '';
	});

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	async function save() {
		saving = true;
		errorMsg = null;
		try {
			const payload: Record<string, unknown> = {
				scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
				scheduled_end: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
				notes: notes.trim() || null,
				scope_of_work: scopeOfWork.trim() || null
			};
			if (canEditAssignee) {
				payload.assigned_to = assignedTo || null;
			}

			const res = await fetch(`/api/jobs/${job.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not save.';
				return;
			}
			const updatedAssigneeName =
				canEditAssignee && assignedTo
					? (assignees.find((a) => a.id === assignedTo)?.full_name ?? job.assignee_name)
					: canEditAssignee
						? null
						: job.assignee_name;

			onSaved({
				...job,
				...body.job,
				assignee_name: updatedAssigneeName
			});
			open = false;
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
			<Sheet.Title>Edit job</Sheet.Title>
		</Sheet.Header>

		<div class="mt-4 space-y-4">
			{#if canEditAssignee}
				<div class="space-y-1.5">
					<Label for="j-assignee">Assigned to</Label>
					<select
						id="j-assignee"
						bind:value={assignedTo}
						class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="">Unassigned</option>
						{#each assignees as a (a.id)}
							<option value={a.id}>{a.full_name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="j-start">Scheduled start</Label>
					<input
						id="j-start"
						type="datetime-local"
						bind:value={scheduledStart}
						class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="j-end">Scheduled end</Label>
					<input
						id="j-end"
						type="datetime-local"
						bind:value={scheduledEnd}
						class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="j-scope">Scope of work</Label>
				<Textarea id="j-scope" bind:value={scopeOfWork} rows={4} />
			</div>

			<div class="space-y-1.5">
				<Label for="j-notes">Notes</Label>
				<Textarea id="j-notes" bind:value={notes} rows={3} />
			</div>

			{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}

			<div class="flex gap-2 pt-2">
				<Button variant="outline" class="flex-1" disabled={saving} onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button class="flex-1" disabled={saving} onclick={save}>
					{saving ? 'Saving…' : 'Save changes'}
				</Button>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
