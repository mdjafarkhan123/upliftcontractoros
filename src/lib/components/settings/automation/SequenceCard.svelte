<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { SelectRoot, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import AutomationCardShell from './AutomationCardShell.svelte';
	import SequenceStepEditor from './SequenceStepEditor.svelte';
	import { CARD_VISUALS, CHANNEL_VISUALS } from './cardVisuals';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		STEP_CHANNELS,
		type AutomationCardDef,
		type EditableStep,
		type StepChannel
	} from '$lib/automation/cardDefinitions';

	type ApiStep = {
		position: number;
		delay_minutes: number;
		offset_minutes: number | null;
		channel: StepChannel | null;
		audience: string;
		condition: string | null;
		sms_body: string | null;
		email_subject: string | null;
		email_body: string | null;
	};
	type ApiSequence = {
		key: string;
		enabled: boolean;
		channel: StepChannel;
		updated_at: string;
		steps: ApiStep[];
	};

	let {
		card,
		sequence,
		featureEnabled,
		expanded = false,
		onToggle,
		onSaved
	}: {
		card: AutomationCardDef;
		sequence: ApiSequence;
		featureEnabled: boolean;
		expanded?: boolean;
		onToggle?: () => void;
		onSaved: (updated: ApiSequence) => void;
	} = $props();

	const visual = $derived(CARD_VISUALS[card.key]);
	const isStaff = $derived(card.audience === 'staff');

	function toEditable(s: ApiStep): EditableStep {
		return {
			position: s.position,
			delay_minutes: s.delay_minutes,
			offset_minutes: s.offset_minutes,
			channel: s.channel,
			audience: s.audience === 'staff' ? 'staff' : 'contact',
			condition: s.condition,
			sms_body: s.sms_body ?? '',
			email_subject: s.email_subject ?? '',
			email_body: s.email_body ?? ''
		};
	}

	type Form = { enabled: boolean; channel: StepChannel; steps: EditableStep[] };
	function snapshot(seq: ApiSequence): Form {
		return { enabled: seq.enabled, channel: seq.channel, steps: seq.steps.map(toEditable) };
	}

	let token = $state(sequence.updated_at);
	let original = $state<Form>(snapshot(sequence));
	let form = $state<Form>(snapshot(sequence));
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	let dirty = $derived(JSON.stringify(original) !== JSON.stringify(form));

	const channelOptions = STEP_CHANNELS.filter((c) => card.allowedChannels.includes(c.value));
	let channelLabel = $derived(
		isStaff ? 'In-app alert' : (STEP_CHANNELS.find((c) => c.value === form.channel)?.label ?? '')
	);
	let meta = $derived(
		`${form.enabled ? 'Active' : 'Off'} · ${form.steps.length} step${form.steps.length === 1 ? '' : 's'} · ${channelLabel}`
	);

	function defaultNewStep(): EditableStep {
		return {
			position: form.steps.length,
			delay_minutes: card.timingMode === 'delay' ? 1440 : 0,
			offset_minutes:
				card.timingMode === 'offset'
					? isStaff
						? 120
						: card.offsetAnchor === 'due'
							? 4320
							: -60
					: null,
			channel: null,
			audience: card.audience,
			condition: isStaff ? 'no_quote_since_anchor' : null,
			sms_body: '',
			email_subject: '',
			email_body: ''
		};
	}
	function addStep() {
		if (form.steps.length >= card.maxSteps) return;
		form.steps = [...form.steps, defaultNewStep()];
	}
	function removeStep(i: number) {
		if (form.steps.length <= card.minSteps) return;
		form.steps = form.steps
			.filter((_, idx) => idx !== i)
			.map((s, idx) => ({ ...s, position: idx }));
	}

	function errorsForStep(i: number): Record<string, string> {
		const prefix = `steps.${i}.`;
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(fieldErrors)) {
			if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
		}
		return out;
	}

	function reset() {
		form = {
			enabled: original.enabled,
			channel: original.channel,
			steps: original.steps.map((s) => ({ ...s }))
		};
		fieldErrors = {};
	}

	async function save() {
		saving = true;
		fieldErrors = {};
		try {
			const payload = {
				updated_at: token,
				enabled: form.enabled,
				...(card.channelEditable ? { channel: form.channel } : {}),
				steps: form.steps.map((s) => ({
					delay_minutes: s.delay_minutes,
					offset_minutes: s.offset_minutes,
					channel: card.channelEditable ? s.channel : null,
					sms_body: s.sms_body.trim() ? s.sms_body : null,
					email_subject: s.email_subject.trim() ? s.email_subject : null,
					email_body: s.email_body.trim() ? s.email_body : null
				}))
			};
			const res = await fetch(`/api/settings/automation/sequences/${card.key}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as {
				data?: ApiSequence;
				error?: string;
				field_errors?: Record<string, string>;
			};

			if (res.status === 409 && body.data) {
				token = body.data.updated_at;
				original = snapshot(body.data);
				form = snapshot(body.data);
				onSaved(body.data);
				toast.error('This automation changed elsewhere. Loaded the latest version.');
				return;
			}
			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				token = body.data.updated_at;
				original = snapshot(body.data);
				form = snapshot(body.data);
				onSaved(body.data);
				toast.success(`${card.title} saved`);
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}
</script>

<AutomationCardShell
	icon={visual.icon}
	accent={visual.accent}
	title={card.title}
	description={card.description}
	{meta}
	locked={!featureEnabled}
	lockedReason={card.lockedReason}
	bind:enabled={form.enabled}
	{expanded}
	{onToggle}
	{dirty}
>
	<div class="seq-edit">
		{#if card.channelEditable}
			{@const selected = channelOptions.find((c) => c.value === form.channel)}
			<div class="field">
				<Label class="field__label">Default channel</Label>
				<div class="seq-edit__channel">
					<SelectRoot value={form.channel} onValueChange={(v) => (form.channel = v as StepChannel)}>
						<SelectTrigger>
							<span class="auto-chan">
								{#if selected}
									<i class="{CHANNEL_VISUALS[selected.value]} auto-chan__icon" aria-hidden="true"
									></i>
									<span>{selected.label}</span>
								{:else}
									<span class="auto-chan__placeholder">Choose a channel</span>
								{/if}
							</span>
						</SelectTrigger>
						<SelectContent>
							{#each channelOptions as c (c.value)}
								<SelectItem value={c.value} label={c.label}>
									<span class="auto-chan auto-chan--option">
										<i class="{CHANNEL_VISUALS[c.value]} auto-chan__icon" aria-hidden="true"></i>
										<span class="auto-chan__text">
											<span class="auto-chan__label">{c.label}</span>
											<span class="auto-chan__desc">{c.description}</span>
										</span>
									</span>
								</SelectItem>
							{/each}
						</SelectContent>
					</SelectRoot>
				</div>
				<p class="field__hint">{selected?.description ?? ''}</p>
			</div>
		{/if}

		{#if fieldErrors.steps}
			<p class="field__error">{fieldErrors.steps}</p>
		{/if}

		<div class="seq-edit__steps">
			{#each form.steps as _step, i (i)}
				<SequenceStepEditor
					bind:step={form.steps[i]}
					index={i}
					{card}
					sequenceChannel={form.channel}
					errors={errorsForStep(i)}
					canRemove={card.stepsEditable && form.steps.length > card.minSteps}
					onRemove={() => removeStep(i)}
				/>
			{/each}
		</div>

		{#if card.stepsEditable && form.steps.length < card.maxSteps}
			<button type="button" onclick={addStep} class="seq-add">
				<span class="seq-add__plus"><i class="ri-add-line" aria-hidden="true"></i></span>
				Add a follow-up step
			</button>
		{/if}

		{#if dirty}
			<footer class="seq-edit__footer">
				<Button variant="outline" size="sm" disabled={saving} onclick={reset}>Reset</Button>
				<Button size="sm" loading={saving} loadingLabel="Saving…" onclick={save}>Save changes</Button>
			</footer>
		{/if}
	</div>
</AutomationCardShell>
