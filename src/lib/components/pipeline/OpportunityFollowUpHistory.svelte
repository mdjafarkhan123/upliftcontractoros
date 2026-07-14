<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/stores/toast.svelte';
	import type { OpportunityFollowUp, FollowUpOutcome } from '$lib/types/pipeline';

	type Props = {
		opportunityId: string;
		followUps: OpportunityFollowUp[];
		canEdit: boolean;
		onLogged: (entry: OpportunityFollowUp) => void;
		onScheduleNext: () => void;
	};

	let { opportunityId, followUps, canEdit, onLogged, onScheduleNext }: Props = $props();

	let showForm = $state(false);
	let selectedOutcome = $state<FollowUpOutcome | null>(null);
	let note = $state('');
	let saving = $state(false);
	let showSchedulePrompt = $state(false);

	type OutcomeConfig = { value: FollowUpOutcome; label: string; icon: string };

	const OUTCOMES: OutcomeConfig[] = [
		{ value: 'called',    label: 'Called',    icon: 'ri-phone-line' },
		{ value: 'texted',    label: 'Texted',    icon: 'ri-message-2-line' },
		{ value: 'emailed',   label: 'Emailed',   icon: 'ri-mail-line' },
		{ value: 'visited',   label: 'Visited',   icon: 'ri-map-pin-line' },
		{ value: 'no_answer', label: 'No answer', icon: 'ri-phone-missed-line' }
	];

	const OUTCOME_ICONS: Record<FollowUpOutcome, string> = {
		called:    'ri-phone-line',
		texted:    'ri-message-2-line',
		emailed:   'ri-mail-line',
		visited:   'ri-map-pin-line',
		no_answer: 'ri-phone-missed-line'
	};

	const OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
		called:    'Called',
		texted:    'Texted',
		emailed:   'Emailed',
		visited:   'Visited',
		no_answer: 'No answer'
	};

	const OUTCOME_TONES: Record<FollowUpOutcome, string> = {
		called:    'success',
		texted:    'info',
		emailed:   'violet',
		visited:   'warning',
		no_answer: 'danger'
	};

	function relative(iso: string): string {
		const diffMs = Date.now() - new Date(iso).getTime();
		const m = Math.round(diffMs / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h}h`;
		const d = Math.round(h / 24);
		if (d < 30) return `${d}d`;
		const mo = Math.round(d / 30);
		if (mo < 12) return `${mo}mo`;
		return `${Math.round(mo / 12)}y`;
	}

	async function submit() {
		if (!selectedOutcome || saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/pipeline/opportunities/${opportunityId}/follow-ups`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ outcome: selectedOutcome, note: note.trim() || null })
			});
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to log follow-up');
				return;
			}
			onLogged(body.data.follow_up as OpportunityFollowUp);
			toast.success('Follow-up logged');
			showForm = false;
			showSchedulePrompt = true;
			selectedOutcome = null;
			note = '';
		} finally {
			saving = false;
		}
	}

	function cancel() {
		showForm = false;
		selectedOutcome = null;
		note = '';
	}

	function scheduleNext() {
		showSchedulePrompt = false;
		onScheduleNext();
	}
</script>

<section class="opp-section">
	<header class="opp-section__header">
		<div class="opp-section__header-left">
			<i class="ri-phone-line opp-section__title-icon" aria-hidden="true"></i>
			<h3 class="opp-section__title">Follow-ups</h3>
			{#if followUps.length > 0}
				<span class="opp-section__count">{followUps.length}</span>
			{/if}
		</div>
		{#if canEdit && !showForm}
			<Button
				variant="ghost"
				size="sm"
				style="height:32px; gap:6px; padding-inline:8px; font-size:12px;"
				onclick={() => {
					showSchedulePrompt = false;
					showForm = true;
				}}
			>
				<i class="ri-add-line" aria-hidden="true"></i>
				Log outcome
			</Button>
		{/if}
	</header>

	{#if showSchedulePrompt}
		<div class="opp-section__schedule-prompt">
			<span>Schedule the next follow-up?</span>
			<div class="opp-section__schedule-actions">
				<Button variant="ghost" size="sm" style="height:32px; padding-inline:8px; font-size:12px;" onclick={() => (showSchedulePrompt = false)}>
					Dismiss
				</Button>
				<Button variant="outline" size="sm" style="height:32px; gap:6px; padding-inline:8px; font-size:12px;" onclick={scheduleNext}>
					<i class="ri-calendar-schedule-line" aria-hidden="true"></i>
					Schedule
				</Button>
			</div>
		</div>
	{/if}

	{#if showForm}
		<div class="follow-up-form">
			<p class="follow-up-form__prompt">What did you do?</p>
			<div class="follow-up-form__outcomes">
				{#each OUTCOMES as o (o.value)}
					<button
						type="button"
						onclick={() => (selectedOutcome = o.value)}
						class="follow-up-form__outcome-btn{selectedOutcome === o.value ? ' follow-up-form__outcome-btn--active' : ''}"
					>
						<i class={o.icon} aria-hidden="true"></i>
						<span>{o.label}</span>
					</button>
				{/each}
			</div>
			<Textarea
				bind:value={note}
				placeholder="Add a note… (optional)"
				style="min-height:72px; resize:none; font-size:14px;"
				maxlength={500}
			/>
			<div class="follow-up-form__actions">
				<Button variant="ghost" size="sm" style="height:36px;" disabled={saving} onclick={cancel}>
					Cancel
				</Button>
				<Button
					size="sm"
					style="height:36px; padding-inline:20px;"
					disabled={!selectedOutcome || saving}
					onclick={submit}
				>
					{saving ? 'Logging…' : 'Log follow-up'}
				</Button>
			</div>
		</div>
	{/if}

	{#if followUps.length === 0 && !showForm}
		<div class="opp-section__empty">
			<p>No follow-ups logged yet.</p>
		</div>
	{:else if followUps.length > 0}
		<ul class="opp-section__list">
			{#each followUps as f (f.id)}
				<li class="opp-section__item">
					<i
						class="{OUTCOME_ICONS[f.outcome]} opp-section__item-icon opp-section__item-icon--{OUTCOME_TONES[f.outcome]}"
						aria-hidden="true"
					></i>
					<div class="opp-section__item-body">
						<p class="opp-section__item-text">
							{OUTCOME_LABELS[f.outcome]}
							<span class="opp-section__item-meta">· {f.logged_by_name}</span>
						</p>
						{#if f.note}
							<p class="opp-section__item-subtext">{f.note}</p>
						{/if}
					</div>
					<span
						class="opp-section__item-time"
						title={new Date(f.occurred_at).toLocaleString()}
					>
						{relative(f.occurred_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
