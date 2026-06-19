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
		STEP_CHANNELS,
		previewTemplate,
		type AutomationCardDef,
		type EditableStep,
		type StepChannel
	} from '$lib/automation/cardDefinitions';
	import { cn } from '$lib/utils/cn';
	import { Trash2, Zap, ChevronDown, Clock, MessageSquare, Mail, Users } from '@lucide/svelte';

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
	const lockedInstant = $derived(card.step0Instant && index === 0);

	const presets = $derived(
		isStaff ? AFTER_OFFSET_PRESETS : isOffset ? BEFORE_OFFSET_PRESETS : DELAY_PRESETS
	);

	let timingMinutes = $derived(isOffset || isStaff ? (step.offset_minutes ?? 0) : step.delay_minutes);

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

	function applyCustom() {
		const factor = UNITS.find((u) => u.value === customUnit)?.factor ?? 1;
		const magnitude = Math.max(0, Math.round((Number(customValue) || 0) * factor));
		const signed = isOffset && !isStaff ? -magnitude : magnitude;
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
	const channelOptions = $derived(STEP_CHANNELS.filter((c) => card.allowedChannels.includes(c.value)));

	// ── Collapsed-summary helpers ───────────────────────────────────────────────
	function humanizeMinutes(mins: number): string {
		const abs = Math.abs(mins);
		if (abs === 0) return 'Immediately';
		let label: string;
		if (abs % 1440 === 0) label = `${abs / 1440} day${abs / 1440 > 1 ? 's' : ''}`;
		else if (abs % 60 === 0) label = `${abs / 60} hour${abs / 60 > 1 ? 's' : ''}`;
		else label = `${abs} min`;
		return label + (isStaff ? ' after' : isOffset ? ' before' : ' later');
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
		isStaff ? 'Team reminder' : index === 0 && card.step0Instant ? 'Instant reply' : `Follow-up ${index}`
	);
	const hasError = $derived(Object.keys(errors).length > 0);
</script>

<div
	class={cn(
		'rounded-xl border bg-background/60 transition-colors',
		hasError ? 'border-destructive/50' : open ? 'border-primary/30' : 'border-border/60'
	)}
>
	<!-- Accordion header -->
	<div class="flex items-center gap-2 p-3">
		<button
			type="button"
			aria-expanded={open}
			onclick={() => (open = !open)}
			class="flex min-h-[40px] flex-1 items-center gap-3 text-left"
		>
			<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
				{index + 1}
			</span>
			<span class="min-w-0 flex-1">
				<span class="flex items-center gap-2">
					<span class="text-sm font-semibold text-foreground">{stepLabel}</span>
					<span class="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
						{#if lockedInstant}<Zap class="h-3 w-3 text-primary" />{:else}<Clock class="h-3 w-3" />{/if}
						{timingSummary}
					</span>
					<span class="hidden items-center gap-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
						{#if isStaff}<Users class="h-3 w-3" />{:else if showEmail && !showSms}<Mail class="h-3 w-3" />{:else}<MessageSquare class="h-3 w-3" />{/if}
						{channelSummary}
					</span>
				</span>
				{#if !open}
					<span class="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{previewSnippet}</span>
				{/if}
			</span>
			<ChevronDown class={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
		</button>
		{#if canRemove}
			<button
				type="button"
				onclick={() => onRemove?.()}
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Remove step"
			>
				<Trash2 class="h-4 w-4" />
			</button>
		{/if}
	</div>

	<!-- Accordion body -->
	{#if open}
		<div class="flex flex-col gap-4 border-t border-border/60 p-3.5">
			<!-- Timing -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs font-medium">When</Label>
				{#if lockedInstant}
					<div class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
						<Zap class="h-3.5 w-3.5 text-primary" />
						Sends immediately
					</div>
				{:else}
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
						<div class="sm:max-w-[220px]">
							<Select bind:value={timingSelect} onchange={() => onTimingSelect(timingSelect)}>
								{#each presets as p (p.minutes)}
									<option value={String(p.minutes)}>{p.label}</option>
								{/each}
								<option value="custom">Custom…</option>
							</Select>
						</div>
						{#if isCustom}
							<div class="flex items-center gap-2">
								<Input type="number" min={0} class="max-w-[90px]" bind:value={customValue} oninput={applyCustom} />
								<div class="max-w-[130px]">
									<Select bind:value={customUnit} onchange={applyCustom}>
										{#each UNITS as u (u.value)}
											<option value={u.value}>{u.value}{isOffset && !isStaff ? ' before' : isStaff ? ' after' : ' later'}</option>
										{/each}
									</Select>
								</div>
							</div>
						{/if}
					</div>
				{/if}
				{#if errors.offset_minutes}
					<p class="text-xs text-destructive">{errors.offset_minutes}</p>
				{/if}
			</div>

			<!-- Per-step channel override -->
			{#if card.channelEditable}
				{@const selected = channelOptions.find((c) => c.value === step.channel)}
				<div class="flex flex-col gap-1.5">
					<Label class="text-xs font-medium">Channel</Label>
					<div class="sm:max-w-[300px]">
						<SelectRoot
							value={step.channel ?? 'default'}
							onValueChange={(v) => (step.channel = v === 'default' ? null : (v as StepChannel))}
						>
							<SelectTrigger>
								<span class="flex items-center gap-2">
									{#if selected}
										{@const Icon = CHANNEL_VISUALS[selected.value]}
										<Icon class="size-4 shrink-0 text-muted-foreground" />
										<span>{selected.label}</span>
									{:else}
										<span class="text-muted-foreground">Use card default</span>
									{/if}
								</span>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="default" label="Use card default">
									<span class="flex flex-col gap-0.5 py-0.5">
										<span class="font-medium leading-none">Use card default</span>
										<span class="text-[11px] leading-snug text-muted-foreground">Follow the channel set for the whole automation.</span>
									</span>
								</SelectItem>
								{#each channelOptions as c (c.value)}
									{@const Icon = CHANNEL_VISUALS[c.value]}
									<SelectItem value={c.value} label={c.label}>
										<span class="flex items-start gap-2.5 py-0.5">
											<Icon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
											<span class="flex flex-col gap-0.5">
												<span class="font-medium leading-none">{c.label}</span>
												<span class="text-[11px] leading-snug text-muted-foreground">{c.description}</span>
											</span>
										</span>
									</SelectItem>
								{/each}
							</SelectContent>
						</SelectRoot>
					</div>
					{#if errors.channel}<p class="text-xs text-destructive">{errors.channel}</p>{/if}
				</div>
			{/if}

			<!-- Bodies -->
			<div class="flex flex-col gap-3">
				{#if isStaff}
					<TemplateEditor id={`step-${index}-title`} label="Reminder title" multiline={false} maxlength={200} allowedVars={card.allowedVars} bind:value={step.email_subject} error={errors.email_subject} />
					<TemplateEditor id={`step-${index}-body`} label="Reminder details" rows={3} allowedVars={card.allowedVars} bind:value={step.sms_body} error={errors.sms_body} hint="Shown to your office and the assigned crew in the notification bell." />
				{:else}
					{#if showSms}
						<TemplateEditor id={`step-${index}-sms`} label="Text message" rows={3} allowedVars={card.allowedVars} bind:value={step.sms_body} error={errors.sms_body} />
					{/if}
					{#if showEmail}
						<TemplateEditor id={`step-${index}-subject`} label="Email subject" multiline={false} maxlength={200} allowedVars={card.allowedVars} bind:value={step.email_subject} error={errors.email_subject} />
						<TemplateEditor id={`step-${index}-email`} label="Email body" rows={6} maxlength={2000} allowedVars={card.allowedVars} bind:value={step.email_body} error={errors.email_body} />
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
