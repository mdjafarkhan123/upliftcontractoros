<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import {
		Select,
		SelectRoot,
		SelectTrigger,
		SelectContent,
		SelectItem
	} from '$lib/components/ui/select';
	import { CHANNEL_VISUALS } from './cardVisuals';
	import TemplateEditor from './TemplateEditor.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import {
		DELAY_PRESETS,
		BEFORE_OFFSET_PRESETS,
		AFTER_OFFSET_PRESETS,
		INVOICE_DUE_OFFSET_PRESETS,
		STEP_CHANNELS,
		previewTemplate,
		type AutomationCardDef,
		type EditableStep,
		type StepChannel
	} from '$lib/automation/cardDefinitions';

	let {
		step = $bindable(),
		index,
		card,
		sequenceChannel,
		errors = {},
		canRemove,
		onRemove
	}: {
		step: EditableStep;
		index: number;
		card: AutomationCardDef;
		sequenceChannel: StepChannel;
		errors?: Record<string, string>;
		canRemove: boolean;
		onRemove?: () => void;
	} = $props();

	const isStaff = $derived(card.audience === 'staff');
	const isOffset = $derived(card.timingMode === 'offset');
	// Invoice reminders are the one offset card that allows BOTH before-due and
	// after-due timing. Appointment reminders stay before-only (negative).
	const isDueOffset = $derived(isOffset && !isStaff && card.offsetAnchor === 'due');
	const lockedInstant = $derived(card.step0Instant && index === 0);

	const presets = $derived(
		isStaff
			? AFTER_OFFSET_PRESETS
			: isDueOffset
				? INVOICE_DUE_OFFSET_PRESETS
				: isOffset
					? BEFORE_OFFSET_PRESETS
					: DELAY_PRESETS
	);

	let timingMinutes = $derived(
		isOffset || isStaff ? (step.offset_minutes ?? 0) : step.delay_minutes
	);

	function setTimingMinutes(mins: number) {
		if (isOffset || isStaff) {
			step.offset_minutes = mins;
			step.delay_minutes = 0;
		} else {
			step.delay_minutes = mins;
			step.offset_minutes = null;
		}
	}

	// A new step (empty bodies) starts expanded; loaded steps start collapsed.
	let open = $state(!(step.sms_body.trim() || step.email_subject.trim()));

	let isCustom = $state(!presets.some((p) => p.minutes === timingMinutes));
	let customWarningOpen = $state(false);
	let timingSelect = $state(
		!presets.some((p) => p.minutes === timingMinutes)
			? 'custom'
			: String(presets.find((p) => p.minutes === timingMinutes)?.minutes ?? presets[0].minutes)
	);

	function onTimingSelect(v: string) {
		if (v === 'custom') {
			customWarningOpen = true;
			return;
		}
		isCustom = false;
		timingSelect = v;
		setTimingMinutes(Number(v));
	}

	function confirmCustom() {
		isCustom = true;
		timingSelect = 'custom';
		customWarningOpen = false;
	}
	function cancelCustom() {
		customWarningOpen = false;
		timingSelect = isCustom
			? 'custom'
			: String(presets.find((p) => p.minutes === timingMinutes)?.minutes ?? presets[0].minutes);
	}

	const UNITS = [
		{ value: 'minutes', factor: 1 },
		{ value: 'hours', factor: 60 },
		{ value: 'days', factor: 1440 }
	];
	function initialUnit(): string {
		const abs = Math.abs(timingMinutes);
		if (abs && abs % 1440 === 0) return 'days';
		if (abs && abs % 60 === 0) return 'hours';
		return 'minutes';
	}
	let customUnit = $state(initialUnit());
	let customValue = $state(
		Math.abs(timingMinutes) / (UNITS.find((u) => u.value === initialUnit())?.factor ?? 1)
	);
	// Invoice-due cards let the contractor pick before/after in custom mode; seed it
	// from the current sign (0 → default to "after due").
	let customDir = $state<'before' | 'after'>(timingMinutes < 0 ? 'before' : 'after');

	function applyCustom() {
		const factor = UNITS.find((u) => u.value === customUnit)?.factor ?? 1;
		const magnitude = Math.max(0, Math.round((Number(customValue) || 0) * factor));
		let signed: number;
		if (isStaff) signed = magnitude;
		else if (isDueOffset) signed = customDir === 'before' ? -magnitude : magnitude;
		else if (isOffset) signed = -magnitude;
		else signed = magnitude;
		setTimingMinutes(signed);
	}

	const effectiveChannel: StepChannel = $derived(
		card.channelEditable ? (step.channel ?? sequenceChannel) : sequenceChannel
	);
	const showSms = $derived(
		isStaff || ['sms_first', 'email_first', 'both', 'sms_only'].includes(effectiveChannel)
	);
	const showEmail = $derived(
		!isStaff &&
			card.emailCapable &&
			['sms_first', 'email_first', 'both', 'email_only'].includes(effectiveChannel)
	);
	const channelOptions = $derived(
		STEP_CHANNELS.filter((c) => card.allowedChannels.includes(c.value))
	);

	// ── Collapsed-summary helpers ───────────────────────────────────────────────
	function humanizeMinutes(mins: number): string {
		const abs = Math.abs(mins);
		if (isDueOffset && abs === 0) return 'On the due date';
		if (abs === 0) return 'Immediately';
		let label: string;
		if (abs % 1440 === 0) label = `${abs / 1440} day${abs / 1440 > 1 ? 's' : ''}`;
		else if (abs % 60 === 0) label = `${abs / 60} hour${abs / 60 > 1 ? 's' : ''}`;
		else label = `${abs} min`;
		const suffix = isDueOffset
			? mins < 0
				? ' before due'
				: ' after due'
			: isStaff
				? ' after'
				: isOffset
					? ' before'
					: ' later';
		return label + suffix;
	}
	const timingSummary = $derived(lockedInstant ? 'Immediately' : humanizeMinutes(timingMinutes));
	const channelSummary = $derived(
		isStaff
			? 'In-app to team'
			: (STEP_CHANNELS.find((c) => c.value === effectiveChannel)?.label ?? '')
	);
	const previewSnippet = $derived.by(() => {
		const raw = (step.sms_body || step.email_subject || '').trim();
		if (!raw) return 'No message yet';
		const txt = previewTemplate(raw);
		return txt.length > 60 ? txt.slice(0, 60) + '…' : txt;
	});

	const stepLabel = $derived(
		isStaff
			? 'Team reminder'
			: index === 0 && card.step0Instant
				? 'Instant reply'
				: `Follow-up ${index}`
	);
	const hasError = $derived(Object.keys(errors).length > 0);
</script>

<div class="seq-step" class:seq-step--error={hasError} class:seq-step--open={open && !hasError}>
	<!-- Accordion header -->
	<div class="seq-step__head">
		<button
			type="button"
			aria-expanded={open}
			onclick={() => (open = !open)}
			class="seq-step__trigger"
		>
			<span class="seq-step__num">{index + 1}</span>
			<span class="seq-step__text">
				<span class="seq-step__summary">
					<span class="seq-step__name">{stepLabel}</span>
					<span class="seq-step__chip">
						<i
							class={lockedInstant
								? 'ri-flashlight-line seq-step__chip-icon--brand'
								: 'ri-time-line'}
							aria-hidden="true"
						></i>
						{timingSummary}
					</span>
					<span class="seq-step__chip seq-step__chip--channel">
						<i
							class={isStaff
								? 'ri-team-line'
								: showEmail && !showSms
									? 'ri-mail-line'
									: 'ri-message-2-line'}
							aria-hidden="true"
						></i>
						{channelSummary}
					</span>
				</span>
				{#if !open}
					<span class="seq-step__preview">{previewSnippet}</span>
				{/if}
			</span>
			<i class="ri-arrow-down-s-line seq-step__chevron" aria-hidden="true"></i>
		</button>
		{#if canRemove}
			<button
				type="button"
				onclick={() => onRemove?.()}
				class="seq-step__remove"
				aria-label="Remove step"
			>
				<i class="ri-delete-bin-line" aria-hidden="true"></i>
			</button>
		{/if}
	</div>

	<!-- Accordion body -->
	{#if open}
		<div class="seq-step__body">
			<!-- Timing -->
			<div class="field">
				<Label class="field__label">When</Label>
				{#if lockedInstant}
					<div class="seq-step__instant">
						<i class="ri-flashlight-line" aria-hidden="true"></i>
						Sends immediately
					</div>
				{:else}
					<div class="seq-step__timing">
						<div class="seq-step__timing-select">
							<Select bind:value={timingSelect} onchange={() => onTimingSelect(timingSelect)}>
								{#each presets as p (p.minutes)}
									<option value={String(p.minutes)}>{p.label}</option>
								{/each}
								<option value="custom">Custom…</option>
							</Select>
						</div>
						{#if isCustom}
							<div class="seq-step__custom">
								<Input
									type="number"
									min={0}
									class="seq-step__custom-num"
									bind:value={customValue}
									oninput={applyCustom}
								/>
								<div class="seq-step__custom-unit">
									<Select bind:value={customUnit} onchange={applyCustom}>
										{#each UNITS as u (u.value)}
											<option value={u.value}
												>{u.value}{isDueOffset
													? ''
													: isOffset && !isStaff
														? ' before'
														: isStaff
															? ' after'
															: ' later'}</option
											>
										{/each}
									</Select>
								</div>
								{#if isDueOffset}
									<div class="seq-step__custom-unit">
										<Select bind:value={customDir} onchange={applyCustom}>
											<option value="before">before due</option>
											<option value="after">after due</option>
										</Select>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
				{#if errors.offset_minutes}
					<p class="field__error">{errors.offset_minutes}</p>
				{/if}
			</div>

			<!-- Per-step channel override -->
			{#if card.channelEditable}
				{@const selected = channelOptions.find((c) => c.value === step.channel)}
				<div class="field">
					<Label class="field__label">Channel</Label>
					<div class="seq-step__channel">
						<SelectRoot
							value={step.channel ?? 'default'}
							onValueChange={(v) => (step.channel = v === 'default' ? null : (v as StepChannel))}
						>
							<SelectTrigger>
								<span class="auto-chan">
									{#if selected}
										<i class="{CHANNEL_VISUALS[selected.value]} auto-chan__icon" aria-hidden="true"
										></i>
										<span>{selected.label}</span>
									{:else}
										<span class="auto-chan__placeholder">Use card default</span>
									{/if}
								</span>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="default" label="Use card default">
									<span class="auto-chan auto-chan--option auto-chan--noicon">
										<span class="auto-chan__text">
											<span class="auto-chan__label">Use card default</span>
											<span class="auto-chan__desc"
												>Follow the channel set for the whole automation.</span
											>
										</span>
									</span>
								</SelectItem>
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
					{#if errors.channel}<p class="field__error">{errors.channel}</p>{/if}
				</div>
			{/if}

			<!-- Bodies -->
			<div class="seq-step__bodies">
				{#if isStaff}
					<TemplateEditor
						id={`step-${index}-title`}
						label="Reminder title"
						multiline={false}
						maxlength={200}
						allowedVars={card.allowedVars}
						bind:value={step.email_subject}
						error={errors.email_subject}
					/>
					<TemplateEditor
						id={`step-${index}-body`}
						label="Reminder details"
						rows={3}
						allowedVars={card.allowedVars}
						bind:value={step.sms_body}
						error={errors.sms_body}
						hint="Shown to your office and the assigned crew in the notification bell."
					/>
				{:else}
					{#if showSms}
						<TemplateEditor
							id={`step-${index}-sms`}
							label="Text message"
							rows={3}
							allowedVars={card.allowedVars}
							bind:value={step.sms_body}
							error={errors.sms_body}
						/>
					{/if}
					{#if showEmail}
						<TemplateEditor
							id={`step-${index}-subject`}
							label="Email subject"
							multiline={false}
							maxlength={200}
							allowedVars={card.allowedVars}
							bind:value={step.email_subject}
							error={errors.email_subject}
						/>
						<TemplateEditor
							id={`step-${index}-email`}
							label="Email body"
							rows={6}
							maxlength={2000}
							allowedVars={card.allowedVars}
							bind:value={step.email_body}
							error={errors.email_body}
						/>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={customWarningOpen}
	title="Use a custom time?"
	description="Presets are tuned for the best response rates and to stay within texting hours. Custom timing can hurt deliverability or land messages at awkward times — use it only if you have a specific reason."
	confirmLabel="Use custom time"
	cancelLabel="Keep preset"
	onConfirm={confirmCustom}
	onCancel={cancelCustom}
/>
