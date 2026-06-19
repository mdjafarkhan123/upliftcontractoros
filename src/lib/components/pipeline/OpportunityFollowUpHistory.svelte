<script lang="ts">
	import { Phone, MessageSquare, Mail, MapPin, PhoneMissed, Plus, CalendarClock } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';
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

	type OutcomeConfig = { value: FollowUpOutcome; label: string; Icon: Component };

	const OUTCOMES: OutcomeConfig[] = [
		{ value: 'called', label: 'Called', Icon: Phone },
		{ value: 'texted', label: 'Texted', Icon: MessageSquare },
		{ value: 'emailed', label: 'Emailed', Icon: Mail },
		{ value: 'visited', label: 'Visited', Icon: MapPin },
		{ value: 'no_answer', label: 'No answer', Icon: PhoneMissed }
	];

	const OUTCOME_ICONS: Record<FollowUpOutcome, Component> = {
		called: Phone,
		texted: MessageSquare,
		emailed: Mail,
		visited: MapPin,
		no_answer: PhoneMissed
	};

	const OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
		called: 'Called',
		texted: 'Texted',
		emailed: 'Emailed',
		visited: 'Visited',
		no_answer: 'No answer'
	};

	const OUTCOME_TONES: Record<FollowUpOutcome, string> = {
		called: 'text-emerald-600 dark:text-emerald-400',
		texted: 'text-blue-600 dark:text-blue-400',
		emailed: 'text-violet-600 dark:text-violet-400',
		visited: 'text-amber-600 dark:text-amber-400',
		no_answer: 'text-rose-600 dark:text-rose-400'
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

<section class="rounded-xl border border-border bg-card">
	<header class="flex items-center justify-between border-b border-border/60 px-3 py-2">
		<div class="flex items-center gap-2">
			<Phone class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
			<h3 class="text-sm font-semibold">Follow-ups</h3>
			{#if followUps.length > 0}
				<span
					class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
				>
					{followUps.length}
				</span>
			{/if}
		</div>
		{#if canEdit && !showForm}
			<Button
				variant="ghost"
				size="sm"
				class="h-8 gap-1.5 px-2 text-xs"
				onclick={() => {
					showSchedulePrompt = false;
					showForm = true;
				}}
			>
				<Plus class="h-3.5 w-3.5" />
				Log outcome
			</Button>
		{/if}
	</header>

	{#if showSchedulePrompt}
		<div class="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-3 py-2.5">
			<p class="text-xs text-muted-foreground">Schedule the next follow-up?</p>
			<div class="flex gap-2">
				<Button
					variant="ghost"
					size="sm"
					class="h-8 px-2 text-xs"
					onclick={() => (showSchedulePrompt = false)}
				>
					Dismiss
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-8 gap-1.5 px-2 text-xs"
					onclick={scheduleNext}
				>
					<CalendarClock class="h-3.5 w-3.5" />
					Schedule
				</Button>
			</div>
		</div>
	{/if}

	{#if showForm}
		<div class="space-y-3 border-b border-border/60 p-3">
			<p class="text-xs font-medium text-muted-foreground">What did you do?</p>
			<div class="grid grid-cols-5 gap-1.5">
				{#each OUTCOMES as o (o.value)}
					{@const active = selectedOutcome === o.value}
					<button
						type="button"
						onclick={() => (selectedOutcome = o.value)}
						class={cn(
							'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg border text-center transition-colors',
							active
								? 'border-primary bg-primary/10 text-primary'
								: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						<o.Icon class="h-4 w-4" aria-hidden="true" />
						<span class="text-[10px] leading-none">{o.label}</span>
					</button>
				{/each}
			</div>
			<Textarea
				bind:value={note}
				placeholder="Add a note… (optional)"
				class="min-h-[72px] resize-none text-sm"
				maxlength={500}
			/>
			<div class="flex justify-between gap-2">
				<Button variant="ghost" size="sm" class="h-9" disabled={saving} onclick={cancel}>
					Cancel
				</Button>
				<Button
					size="sm"
					class="h-9 px-5"
					disabled={!selectedOutcome || saving}
					onclick={submit}
				>
					{saving ? 'Logging…' : 'Log follow-up'}
				</Button>
			</div>
		</div>
	{/if}

	{#if followUps.length === 0 && !showForm}
		<div class="px-3 py-4 text-center">
			<p class="text-xs text-muted-foreground">No follow-ups logged yet.</p>
		</div>
	{:else if followUps.length > 0}
		<ul class="divide-y divide-border/40">
			{#each followUps as f (f.id)}
				{@const Icon = OUTCOME_ICONS[f.outcome]}
				<li class="flex items-start gap-2.5 px-3 py-2">
					<Icon
						class={cn('mt-0.5 h-3.5 w-3.5 shrink-0', OUTCOME_TONES[f.outcome])}
						aria-hidden="true"
					/>
					<div class="min-w-0 flex-1">
						<p class="text-xs font-medium leading-snug text-foreground">
							{OUTCOME_LABELS[f.outcome]}
							<span class="font-normal text-muted-foreground">· {f.logged_by_name}</span>
						</p>
						{#if f.note}
							<p class="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.note}</p>
						{/if}
					</div>
					<span
						class="shrink-0 text-[10px] tabular-nums text-muted-foreground"
						title={new Date(f.occurred_at).toLocaleString()}
					>
						{relative(f.occurred_at)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
