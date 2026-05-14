<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import LostReasonDialog from './LostReasonDialog.svelte';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import type { OpportunityDetail, PipelineStageRow } from '$lib/types/pipeline';

	type Assignee = { id: string; full_name: string };

	type Props = {
		open: boolean;
		opportunity: OpportunityDetail;
		stages: PipelineStageRow[];
		assignees: Assignee[];
		canEdit: boolean;
		onClose: () => void;
		onChanged: (next: OpportunityDetail) => void;
	};

	let {
		open = $bindable(),
		opportunity,
		stages,
		assignees,
		canEdit,
		onClose,
		onChanged
	}: Props = $props();

	let title = $derived(opportunity.title);
	let value = $derived(opportunity.value ?? '');
	let assignedTo = $derived(opportunity.assigned_to ?? '');
	let stageId = $derived(opportunity.stage_id);

	let saving = $state(false);
	let stageSaving = $state(false);
	let wonOpen = $state(false);
	let lostOpen = $state(false);
	let actionLoading = $state(false);
	let errorMsg = $state<string | null>(null);

	$effect(() => {
		title = opportunity.title;
		value = opportunity.value ?? '';
		assignedTo = opportunity.assigned_to ?? '';
		stageId = opportunity.stage_id;
	});

	const wonStage = $derived(stages.find((s) => s.is_won));
	const lostStage = $derived(stages.find((s) => s.is_lost));
	const currentStage = $derived(stages.find((s) => s.id === opportunity.stage_id));

	async function saveFields() {
		saving = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/pipeline/opportunities/${opportunity.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					value: value.trim() || null,
					assigned_to: assignedTo || null
				})
			});
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Could not save.';
				return;
			}
			onChanged({ ...opportunity, ...body.opportunity });
		} finally {
			saving = false;
		}
	}

	async function moveToStage(targetStageId: string, lost_reason?: string) {
		const res = await fetch(`/api/pipeline/opportunities/${opportunity.id}/stage`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ stage_id: targetStageId, lost_reason })
		});
		const body = await res.json();
		if (!res.ok) {
			errorMsg = body.error ?? 'Could not move stage.';
			return null;
		}
		onChanged({ ...opportunity, ...body.opportunity });
		return body;
	}

	async function changeStage() {
		if (stageId === opportunity.stage_id) return;
		const target = stages.find((s) => s.id === stageId);
		if (!target) return;

		if (target.is_won) {
			wonOpen = true;
			stageId = opportunity.stage_id;
			return;
		}
		if (target.is_lost) {
			lostOpen = true;
			stageId = opportunity.stage_id;
			return;
		}
		stageSaving = true;
		await moveToStage(target.id);
		stageSaving = false;
	}

	async function confirmWon() {
		if (!wonStage) return;
		actionLoading = true;
		await moveToStage(wonStage.id);
		actionLoading = false;
		wonOpen = false;
	}

	async function confirmLost(reason: string) {
		if (!lostStage) return;
		actionLoading = true;
		await moveToStage(lostStage.id, reason);
		actionLoading = false;
		lostOpen = false;
	}
</script>

<Sheet.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Sheet.Content side="bottom" class="max-h-[92vh] overflow-y-auto">
		<Sheet.Header>
			<Sheet.Title>Opportunity</Sheet.Title>
		</Sheet.Header>

		<div class="mt-4 space-y-5">
			<div class="rounded-xl border border-border bg-muted/40 p-3">
				<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</div>
				<div class="mt-1 text-base font-semibold">{opportunity.contact_name}</div>
				<div class="text-sm text-muted-foreground">{opportunity.contact_phone}</div>
				{#if opportunity.contact_email}
					<div class="text-sm text-muted-foreground">{opportunity.contact_email}</div>
				{/if}
			</div>

			<div class="space-y-1.5">
				<Label for="d-title">Title <span class="text-destructive">*</span></Label>
				<Input id="d-title" bind:value={title} disabled={!canEdit} />
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label for="d-value">Value</Label>
					<Input
						id="d-value"
						bind:value
						type="text"
						inputmode="decimal"
						disabled={!canEdit}
						placeholder="0.00"
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="d-assignee">Assigned to</Label>
					<select
						id="d-assignee"
						bind:value={assignedTo}
						disabled={!canEdit}
						class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="">Unassigned</option>
						{#each assignees as m (m.id)}
							<option value={m.id}>{m.full_name}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="d-stage">Stage</Label>
				<select
					id="d-stage"
					bind:value={stageId}
					disabled={!canEdit || stageSaving}
					onchange={changeStage}
					class="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#each stages as s (s.id)}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>
			</div>

			{#if currentStage?.is_lost && opportunity.lost_reason}
				<div class="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
					<div class="text-xs font-medium uppercase tracking-wide text-rose-600">Lost reason</div>
					<p class="mt-1 text-sm text-foreground">{opportunity.lost_reason}</p>
				</div>
			{/if}

			{#if opportunity.closed_at}
				<p class="text-xs text-muted-foreground">
					Closed {formatDate(opportunity.closed_at)}
					{#if opportunity.value}
						· {formatCurrency(opportunity.value)}{/if}
				</p>
			{/if}

			{#if errorMsg}<p class="text-sm text-destructive">{errorMsg}</p>{/if}

			{#if canEdit}
				<div class="flex gap-2">
					<JetEngineButton
						class="flex-1"
						label="Save changes"
						loadingLabel="Saving…"
						successLabel="Saved"
						state={saving ? 'loading' : 'idle'}
						onclick={saveFields}
					/>
				</div>

				{#if !currentStage?.is_won && !currentStage?.is_lost}
					<div class="grid grid-cols-2 gap-2 pt-2">
						<Button
							variant="outline"
							class="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
							onclick={() => (wonOpen = true)}
						>
							Mark won
						</Button>
						<Button
							variant="outline"
							class="border-rose-500/40 text-rose-700 hover:bg-rose-500/10"
							onclick={() => (lostOpen = true)}
						>
							Mark lost
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

<ConfirmDialog
	bind:open={wonOpen}
	title="Mark as won?"
	description="A job will be created automatically and the contact will become a customer."
	confirmLabel="Mark won"
	loading={actionLoading}
	onConfirm={confirmWon}
/>

<LostReasonDialog
	bind:open={lostOpen}
	loading={actionLoading}
	onCancel={() => (lostOpen = false)}
	onConfirm={confirmLost}
/>
