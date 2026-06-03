<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import LostReasonDialog from './LostReasonDialog.svelte';
	import OpportunityQuotesSection from './OpportunityQuotesSection.svelte';
	import OpportunityActivitySection from './OpportunityActivitySection.svelte';
	import { getMemberContext } from '$lib/context/member';
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

	const member = getMemberContext();
	const canViewRevenue = $derived(member().can_view_revenue);
	const canCreateQuotes = $derived(member().can_create_quotes);
	const newQuoteHref = $derived(
		`/quotes/new?opportunity_id=${opportunity.id}&contact_id=${opportunity.contact_id}`
	);

	let title = $derived(opportunity.title);
	let value = $derived(opportunity.value ?? '');
	let assignedTo = $derived(opportunity.assigned_to ?? '');
	let stageId = $derived(opportunity.stage_id);
	let expectedCloseDate = $derived(opportunity.expected_close_date ?? '');

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
		expectedCloseDate = opportunity.expected_close_date ?? '';
	});

	const wonStage = $derived(stages.find((s) => s.is_won));
	const lostStage = $derived(stages.find((s) => s.is_lost));
	const currentStage = $derived(stages.find((s) => s.id === opportunity.stage_id));

	const daysInStage = $derived(
		Math.max(
			0,
			Math.floor((Date.now() - new Date(opportunity.stage_entered_at).getTime()) / 86_400_000)
		)
	);
	const staleAfter = $derived(currentStage?.stale_after_days ?? null);
	const showAging = $derived(staleAfter !== null);
	const isStale = $derived(staleAfter !== null && daysInStage >= staleAfter);

	function openFollowUp() {
		window.location.href = `/inbox?contact=${opportunity.contact_id}`;
	}

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
					assigned_to: assignedTo || null,
					expected_close_date: expectedCloseDate || null
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
		const fromStageId = opportunity.stage_id;
		const res = await fetch(`/api/pipeline/opportunities/${opportunity.id}/stage`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				stage_id: targetStageId,
				from_stage_id: fromStageId,
				move_request_id: crypto.randomUUID(),
				lost_reason
			})
		});
		const body = await res.json().catch(() => ({}));
		if (res.status === 409) {
			errorMsg = body.error ?? 'This opportunity has already moved.';
			if (body?.current_stage_id) {
				onChanged({ ...opportunity, stage_id: body.current_stage_id });
			}
			return null;
		}
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
					<Select.Root bind:value={assignedTo} disabled={!canEdit}>
						<Select.Trigger class="h-11 w-full" disabled={!canEdit}>
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Unassigned</Select.Item>
							{#each assignees as m (m.id)}
								<Select.Item value={m.id}>{m.full_name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="d-expected-close">Expected close date</Label>
				<Input
					id="d-expected-close"
					type="date"
					bind:value={expectedCloseDate}
					disabled={!canEdit}
				/>
			</div>

			<div class="space-y-1.5">
				<Label for="d-stage">Stage</Label>
				<Select.Root
					bind:value={stageId}
					disabled={!canEdit || stageSaving}
					onValueChange={changeStage}
				>
					<Select.Trigger class="h-11 w-full" disabled={!canEdit || stageSaving}>
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						{#each stages as s (s.id)}
							<Select.Item value={s.id}>{s.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if showAging}
				<div
					class={isStale
						? 'flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3'
						: 'flex items-center justify-between gap-3 text-xs text-muted-foreground'}
				>
					<div class={isStale ? 'text-sm text-amber-700 dark:text-amber-300' : ''}>
						{#if isStale}
							<span class="font-semibold">Stuck:</span>
						{/if}
						In stage for {daysInStage} day{daysInStage === 1 ? '' : 's'}
						{#if isStale && staleAfter !== null}
							<span class="opacity-80"> · threshold {staleAfter}d</span>
						{/if}
					</div>
					{#if isStale}
						<Button size="sm" variant="outline" onclick={openFollowUp}>Send follow-up</Button>
					{/if}
				</div>
			{/if}

			{#if currentStage?.is_lost && opportunity.lost_reason}
				<div class="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
					<div class="text-xs font-medium uppercase tracking-wide text-rose-600">Lost reason</div>
					<p class="mt-1 text-sm text-foreground">{opportunity.lost_reason}</p>
				</div>
			{/if}

			{#if canViewRevenue}
				<OpportunityQuotesSection
					quotes={opportunity.quotes ?? []}
					contactId={opportunity.contact_id}
					opportunityId={opportunity.id}
					canCreate={canCreateQuotes}
				/>
			{/if}

			<OpportunityActivitySection
				activity={opportunity.activity ?? []}
				hasQuotes={(opportunity.quotes?.length ?? 0) > 0}
				canCreate={canViewRevenue && canCreateQuotes}
				{newQuoteHref}
			/>

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
