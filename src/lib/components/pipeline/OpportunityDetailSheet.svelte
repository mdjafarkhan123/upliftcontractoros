<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import ActiveAutomations from '$lib/components/automation/ActiveAutomations.svelte';
	import LostReasonDialog from './LostReasonDialog.svelte';
	import OpportunityQuotesSection from './OpportunityQuotesSection.svelte';
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import OpportunityActivitySection from './OpportunityActivitySection.svelte';
	import OpportunityFollowUpPopover from './OpportunityFollowUpPopover.svelte';
	import OpportunityFollowUpHistory from './OpportunityFollowUpHistory.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { SvelteMap } from 'svelte/reactivity';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import type {
		OpportunityDetail,
		OpportunityFollowUp,
		PipelineStageRow
	} from '$lib/types/pipeline';
	import { LOST_REASON_LABELS } from '$lib/types/pipeline';

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
	const canViewFiles = $derived(member().can_view_all_files);
	const canUploadFiles = $derived(member().can_upload_files);
	const newQuoteHref = $derived(
		`/quotes/new?opportunity_id=${opportunity.id}&contact_id=${opportunity.contact_id}`
	);

	let title = $derived(opportunity.title);
	let value = $derived(opportunity.value ?? '');
	let assignedTo = $derived(opportunity.assigned_to ?? '');
	let stageId = $derived(opportunity.stage_id);
	let expectedCloseDate = $derived(opportunity.expected_close_date ?? '');

	let isDesktop = $state(false);

	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(min-width: 1024px)');
		isDesktop = mq.matches;
		const handler = (e: MediaQueryListEvent) => {
			isDesktop = e.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	let saving = $state(false);
	let stageSaving = $state(false);
	let wonOpen = $state(false);
	let lostOpen = $state(false);
	let actionLoading = $state(false);
	let errorMsg = $state<string | null>(null);
	let followUpPopoverOpen = $state(false);

	const followUpAdditions = new SvelteMap<string, OpportunityFollowUp[]>();
	const localFollowUps = $derived([
		...(followUpAdditions.get(opportunity.id) ?? []),
		...(opportunity.follow_ups ?? [])
	]);

	function onFollowUpLogged(entry: OpportunityFollowUp) {
		const current = followUpAdditions.get(opportunity.id) ?? [];
		followUpAdditions.set(opportunity.id, [entry, ...current]);
	}

	$effect(() => {
		title = opportunity.title;
		value = opportunity.value ?? '';
		assignedTo = opportunity.assigned_to ?? '';
		stageId = opportunity.stage_id;
		expectedCloseDate = opportunity.expected_close_date ?? '';
	});

	const currentStage = $derived(stages.find((s) => s.id === opportunity.stage_id));
	const isOpen = $derived(opportunity.status === 'open');

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
		goto(`/inbox?contact=${opportunity.contact_id}`);
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

	async function moveToStage(targetStageId: string) {
		const fromStageId = opportunity.stage_id;
		const res = await fetch(`/api/pipeline/opportunities/${opportunity.id}/stage`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				stage_id: targetStageId,
				from_stage_id: fromStageId,
				move_request_id: crypto.randomUUID()
			})
		});
		const body = await res.json().catch(() => ({}));
		if (res.status === 409) {
			errorMsg = body.error ?? 'This opportunity has already moved.';
			return null;
		}
		if (!res.ok) {
			errorMsg = body.error ?? 'Could not move stage.';
			return null;
		}
		onChanged({ ...opportunity, ...body.data.opportunity });
		return body;
	}

	async function markStatus(
		status: 'won' | 'lost',
		lost_reason?: string,
		lost_reason_note?: string
	) {
		const res = await fetch(`/api/pipeline/opportunities/${opportunity.id}/status`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				status,
				request_id: crypto.randomUUID(),
				lost_reason,
				lost_reason_note
			})
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			errorMsg = body.error ?? 'Could not update status.';
			return null;
		}
		onChanged({ ...opportunity, ...body.data.opportunity });
		return body;
	}

	async function changeStage() {
		if (stageId === opportunity.stage_id) return;
		const target = stages.find((s) => s.id === stageId);
		if (!target) return;
		stageSaving = true;
		await moveToStage(target.id);
		stageSaving = false;
	}

	async function confirmWon() {
		actionLoading = true;
		await markStatus('won');
		actionLoading = false;
		wonOpen = false;
	}

	async function confirmLost(reason: string, note?: string) {
		actionLoading = true;
		await markStatus('lost', reason, note);
		actionLoading = false;
		lostOpen = false;
	}
</script>

<Sheet.Root bind:open onOpenChange={(o) => !o && onClose()}>
	<Sheet.Content
		side={isDesktop ? 'right' : 'bottom'}
		class={isDesktop ? 'overflow-y-auto w-[520px] sm:max-w-[520px]' : 'overflow-y-auto max-h-[92vh]'}
	>
		<Sheet.Header>
			<Sheet.Title>{opportunity.contact_name}</Sheet.Title>
			<p style="font-size: var(--text-body); color: var(--color-text-muted);">{opportunity.title}</p>
		</Sheet.Header>

		<div class="opp-sheet">
			<!-- Contact block -->
			<div class="opp-sheet__contact-block">
				<div class="opp-sheet__contact-label">Contact</div>
				<a href="/contacts/{opportunity.contact_id}" class="opp-sheet__contact-name">
					{opportunity.contact_name}
				</a>
				<div class="opp-sheet__contact-meta">{opportunity.contact_phone}</div>
				{#if opportunity.contact_email}
					<div class="opp-sheet__contact-meta">{opportunity.contact_email}</div>
				{/if}
				<div class="opp-sheet__quick-actions">
					<a href="tel:{opportunity.contact_phone}" class="opp-sheet__quick-btn">
						<i class="ri-phone-line" aria-hidden="true"></i>
						Call
					</a>
					<button
						type="button"
						onclick={() => goto(`/inbox?contact=${opportunity.contact_id}`)}
						class="opp-sheet__quick-btn"
					>
						<i class="ri-message-2-line" aria-hidden="true"></i>
						Text
					</button>
					{#if opportunity.contact_email}
						<a href="mailto:{opportunity.contact_email}" class="opp-sheet__quick-btn">
							<i class="ri-mail-line" aria-hidden="true"></i>
							Email
						</a>
					{/if}
				</div>
			</div>

			<!-- Fields -->
			<div class="opp-sheet__fields">
				<div>
					<Label for="d-title">Title <span style="color: var(--danger-solid)">*</span></Label>
					<Input id="d-title" bind:value={title} disabled={!canEdit} />
				</div>

				<div class="opp-sheet__grid-2">
					<div>
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
					<div>
						<Label for="d-assignee">Assigned to</Label>
						<Select.Root bind:value={assignedTo} disabled={!canEdit}>
							<Select.Trigger class="h-11 w-full" disabled={!canEdit}>
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
				</div>

				<div class="opp-sheet__grid-2">
					<div>
						<Label for="d-expected-close">Expected close date</Label>
						<Input
							id="d-expected-close"
							type="date"
							bind:value={expectedCloseDate}
							disabled={!canEdit}
						/>
					</div>
					<div>
						<Label for="d-follow-up">Next follow-up</Label>
						<OpportunityFollowUpPopover
							opportunityId={opportunity.id}
							currentValue={opportunity.next_follow_up_at}
							disabled={!canEdit}
							bind:open={followUpPopoverOpen}
							onUpdated={(iso) => onChanged({ ...opportunity, next_follow_up_at: iso })}
						/>
					</div>
				</div>

				<div>
					<Label for="d-stage">Stage</Label>
					<Select.Root
						bind:value={stageId}
						disabled={!canEdit || !isOpen || stageSaving}
						onValueChange={changeStage}
					>
						<Select.Trigger class="h-11 w-full" disabled={!canEdit || !isOpen || stageSaving}>
							{stages.find((s) => s.id === stageId)?.name ?? 'Select stage'}
						</Select.Trigger>
						<Select.Content>
							{#each stages as s (s.id)}
								<Select.Item value={s.id}>{s.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				{#if showAging}
					<div class="opp-sheet__aging opp-sheet__aging--{isStale ? 'stale' : 'normal'}">
						{#if isStale}
							<p class="opp-sheet__aging-text">
								<strong>Stuck:</strong>
								In stage for {daysInStage} day{daysInStage === 1 ? '' : 's'}
								{#if staleAfter !== null}
									<span style="opacity:0.8"> · threshold {staleAfter}d</span>
								{/if}
							</p>
							<Button size="sm" variant="outline" onclick={openFollowUp}>Send follow-up</Button>
						{:else}
							In stage for {daysInStage} day{daysInStage === 1 ? '' : 's'}
						{/if}
					</div>
				{/if}

				{#if opportunity.status === 'lost' && opportunity.lost_reason}
					<div class="opp-sheet__status-banner opp-sheet__status-banner--lost">
						<div class="opp-sheet__status-label opp-sheet__status-label--lost">Lost reason</div>
						<p class="opp-sheet__status-reason">
							{LOST_REASON_LABELS[opportunity.lost_reason]}
						</p>
						{#if opportunity.lost_reason_note}
							<p class="opp-sheet__status-note">{opportunity.lost_reason_note}</p>
						{/if}
					</div>
				{/if}

				{#if opportunity.status === 'won'}
					<div class="opp-sheet__status-banner opp-sheet__status-banner--won">
						<div class="opp-sheet__status-label opp-sheet__status-label--won">Won</div>
						<p class="opp-sheet__status-desc">A job was created for this opportunity.</p>
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

				{#if canViewFiles}
					<AttachmentList
						parentFk={{ opportunity_id: opportunity.id }}
						purposeTag="opportunity_attachment"
						title="Photos & Files"
						uploadLabel="Add photos"
						canUpload={canUploadFiles}
						canDelete={canUploadFiles}
					/>
				{/if}

				<OpportunityFollowUpHistory
					opportunityId={opportunity.id}
					followUps={localFollowUps}
					{canEdit}
					onLogged={onFollowUpLogged}
					onScheduleNext={() => (followUpPopoverOpen = true)}
				/>

				<OpportunityActivitySection
					activity={opportunity.activity ?? []}
					hasQuotes={(opportunity.quotes?.length ?? 0) > 0}
					canCreate={canViewRevenue && canCreateQuotes}
					{newQuoteHref}
				/>

				<ActiveAutomations contactId={opportunity.contact_id} />

				{#if opportunity.closed_at}
					<p class="opp-sheet__closed-at">
						Closed {formatDate(opportunity.closed_at)}
						{#if opportunity.value}
							· {formatCurrency(opportunity.value)}
						{/if}
					</p>
				{/if}

				{#if errorMsg}
					<p class="opp-sheet__error">{errorMsg}</p>
				{/if}

				{#if canEdit}
					<div class="opp-sheet__actions">
						<Button
							class="flex-1"
							loadingLabel="Saving…"
							successLabel="Saved"
							loading={saving}
							onclick={saveFields}
						>
							Save changes
						</Button>
					</div>

					{#if isOpen}
						<div class="opp-sheet__won-lost">
							<Button
								variant="outline"
								style="border-color: rgba(79,207,143,0.4); color: var(--success-text);"
								onclick={() => (wonOpen = true)}
							>
								Mark won
							</Button>
							<Button
								variant="outline"
								style="border-color: rgba(225,29,72,0.4); color: var(--danger-text);"
								onclick={() => (lostOpen = true)}
							>
								Mark lost
							</Button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</Sheet.Content>

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
</Sheet.Root>
