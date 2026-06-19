<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import SequenceCard from '$lib/components/settings/automation/SequenceCard.svelte';
	import AutomationCardShell from '$lib/components/settings/automation/AutomationCardShell.svelte';
	import { CARD_VISUALS } from '$lib/components/settings/automation/cardVisuals';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { validateTemplateVariables } from '$lib/utils/validation/templateVariables';
	import { MessageSquare } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import {
		AUTOMATION_CARDS,
		type AutomationCardDef,
		type CardCategory,
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

	type FlatForm = {
		updated_at: string;
		review_funnel_enabled: boolean;
		review_funnel_delay_hours: number;
		google_review_link: string;
		review_funnel_message: string;
		review_funnel_reminder_enabled: boolean;
		review_funnel_reminder_message: string;
		appointment_confirmation_enabled: boolean;
		appointment_confirmation_sms_message: string;
		appointment_confirmation_email_subject: string;
		appointment_confirmation_email_message: string;
		payment_receipt_enabled: boolean;
		payment_receipt_message: string;
		payment_receipt_sms_enabled: boolean;
		payment_receipt_sms_message: string;
	};

	const FLAT_KEYS: (keyof FlatForm)[] = [
		'review_funnel_enabled',
		'review_funnel_delay_hours',
		'google_review_link',
		'review_funnel_message',
		'review_funnel_reminder_enabled',
		'review_funnel_reminder_message',
		'appointment_confirmation_enabled',
		'appointment_confirmation_sms_message',
		'appointment_confirmation_email_subject',
		'appointment_confirmation_email_message',
		'payment_receipt_enabled',
		'payment_receipt_message',
		'payment_receipt_sms_enabled',
		'payment_receipt_sms_message'
	];

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();
	let m = $derived(member());
	let flags = $derived(featureFlags());

	let loading = $state(true);
	let seqByKey = $state<Record<string, ApiSequence>>({});

	let flatOriginal = $state<FlatForm | null>(null);
	let flatForm = $state<FlatForm | null>(null);
	let savingFlat = $state(false);
	let flatErrors = $state<Record<string, string>>({});

	let smsCredit = $state<{ balance: string; monthly_included_credit: string } | null>(null);

	// Single-open accordion across the whole page.
	let expandedKey = $state<string | null>(null);
	function toggleExpand(key: string) {
		expandedKey = expandedKey === key ? null : key;
	}

	let flatDirty = $derived(
		flatOriginal !== null && flatForm !== null && JSON.stringify(flatOriginal) !== JSON.stringify(flatForm)
	);

	const CATEGORIES: CardCategory[] = ['Inbound', 'Follow-ups', 'Appointments'];
	function cardsIn(cat: CardCategory): AutomationCardDef[] {
		return AUTOMATION_CARDS.filter((c) => c.category === cat);
	}
	function cardFeatureEnabled(card: AutomationCardDef): boolean {
		return Boolean(flags[card.featureFlag]);
	}

	function defaultSequence(card: AutomationCardDef): ApiSequence {
		return {
			key: card.key,
			enabled: false,
			channel: card.allowedChannels[0] ?? 'sms_only',
			updated_at: '',
			steps: [
				{
					position: 0,
					delay_minutes: 0,
					offset_minutes:
						card.timingMode === 'offset' ? (card.audience === 'staff' ? 120 : -1440) : null,
					channel: null,
					audience: card.audience,
					condition: card.audience === 'staff' ? 'no_quote_since_anchor' : null,
					sms_body: '',
					email_subject: '',
					email_body: ''
				}
			]
		};
	}
	function sequenceFor(card: AutomationCardDef): ApiSequence {
		return seqByKey[card.key] ?? defaultSequence(card);
	}

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void loadAll();
		void loadSmsCredit();
	});

	async function loadSmsCredit() {
		try {
			const res = await fetch('/api/settings/sms-credit');
			if (!res.ok) return;
			const body = (await res.json()) as { data?: { balance: string; monthly_included_credit: string } };
			if (body.data) smsCredit = body.data;
		} catch {
			// Non-critical.
		}
	}

	function normalizeFlat(d: Record<string, unknown>): FlatForm {
		return {
			updated_at: String(d.updated_at),
			review_funnel_enabled: Boolean(d.review_funnel_enabled),
			review_funnel_delay_hours: Number(d.review_funnel_delay_hours),
			google_review_link: (d.google_review_link as string | null) ?? '',
			review_funnel_message: String(d.review_funnel_message),
			review_funnel_reminder_enabled: Boolean(d.review_funnel_reminder_enabled),
			review_funnel_reminder_message: String(d.review_funnel_reminder_message),
			appointment_confirmation_enabled: Boolean(d.appointment_confirmation_enabled),
			appointment_confirmation_sms_message: String(d.appointment_confirmation_sms_message),
			appointment_confirmation_email_subject: String(d.appointment_confirmation_email_subject),
			appointment_confirmation_email_message: String(d.appointment_confirmation_email_message),
			payment_receipt_enabled: Boolean(d.payment_receipt_enabled),
			payment_receipt_message: String(d.payment_receipt_message),
			payment_receipt_sms_enabled: Boolean(d.payment_receipt_sms_enabled),
			payment_receipt_sms_message: String(d.payment_receipt_sms_message)
		};
	}

	async function loadAll() {
		loading = true;
		try {
			const [flatRes, seqRes] = await Promise.all([
				fetch('/api/settings/automation'),
				fetch('/api/settings/automation/sequences')
			]);

			const flatBody = (await flatRes.json()) as { data?: Record<string, unknown>; error?: string };
			if (flatRes.ok && flatBody.data) {
				const n = normalizeFlat(flatBody.data);
				flatOriginal = n;
				flatForm = { ...n };
			} else {
				toast.error(flatBody.error ?? 'Failed to load automation settings');
			}

			const seqBody = (await seqRes.json()) as { data?: { sequences: ApiSequence[] }; error?: string };
			if (seqRes.ok && seqBody.data) {
				const map: Record<string, ApiSequence> = {};
				for (const s of seqBody.data.sequences) map[s.key] = s;
				seqByKey = map;
			} else {
				toast.error(seqBody.error ?? 'Failed to load automation sequences');
			}
		} finally {
			loading = false;
		}
	}

	function onSequenceSaved(updated: ApiSequence) {
		seqByKey = { ...seqByKey, [updated.key]: updated };
	}

	function validateFlat(f: FlatForm): Record<string, string> {
		const errs: Record<string, string> = {};
		const templateFields: (keyof FlatForm)[] = [
			'review_funnel_message',
			'review_funnel_reminder_message',
			'appointment_confirmation_sms_message',
			'appointment_confirmation_email_subject',
			'appointment_confirmation_email_message',
			'payment_receipt_message',
			'payment_receipt_sms_message'
		];
		for (const k of templateFields) {
			const v = f[k];
			if (typeof v === 'string') {
				const r = validateTemplateVariables(v);
				if (!r.ok) errs[k] = `Unknown variable(s): ${r.unknown.map((u) => `{${u}}`).join(', ')}.`;
			}
		}
		if (typeof f.review_funnel_message === 'string' && !f.review_funnel_message.includes('{review_link}')) {
			errs.review_funnel_message = 'Must include {review_link}.';
		}
		if (typeof f.review_funnel_reminder_message === 'string' && !f.review_funnel_reminder_message.includes('{review_link}')) {
			errs.review_funnel_reminder_message = 'Must include {review_link}.';
		}
		return errs;
	}

	async function saveFlat() {
		if (!flatForm || !flatOriginal) return;
		flatErrors = validateFlat(flatForm);
		if (Object.keys(flatErrors).length > 0) {
			toast.error('Please fix the highlighted fields');
			return;
		}
		savingFlat = true;
		try {
			const payload: Record<string, unknown> = { updated_at: flatOriginal.updated_at };
			for (const k of FLAT_KEYS) {
				if (flatForm[k] !== flatOriginal[k]) {
					payload[k] = k === 'google_review_link' && flatForm[k] === '' ? null : flatForm[k];
				}
			}
			if (Object.keys(payload).length === 1) {
				toast.info('No changes to save');
				savingFlat = false;
				return;
			}

			const res = await fetch('/api/settings/automation', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as {
				data?: Record<string, unknown>;
				error?: string;
				field_errors?: Record<string, string>;
			};

			if (res.status === 409 && body.data) {
				const n = normalizeFlat(body.data);
				flatOriginal = n;
				flatForm = { ...n };
				toast.error('Settings changed elsewhere. Loaded the latest version.');
				return;
			}
			if (!res.ok) {
				flatErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				const n = normalizeFlat(body.data);
				flatOriginal = n;
				flatForm = { ...n };
				toast.success('Settings saved');
			}
		} catch {
			toast.error('Save failed');
		} finally {
			savingFlat = false;
		}
	}
</script>

<svelte:head><title>Automation Settings</title></svelte:head>

<UnsavedChangesGuard dirty={flatDirty} />

<PageWrapper title="Automation" subtitle="Auto-replies, follow-ups, reminders" back="/settings">
	<div class="mx-auto w-full max-w-5xl">
		{#if smsCredit}
			{@const balance = Number(smsCredit.balance)}
			{@const allowance = Number(smsCredit.monthly_included_credit)}
			{@const low = allowance > 0 && balance < allowance * 0.2}
			<div class="mb-5 flex items-center gap-3.5 rounded-2xl border border-border/60 bg-card px-4 py-3.5 shadow-card md:px-5">
				<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
					<MessageSquare class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold text-foreground">SMS Credit</p>
					<p class="text-xs text-muted-foreground">Texts sent by your automations draw from this balance.</p>
				</div>
				<div class="shrink-0 text-right">
					<p class={cn('text-sm font-semibold tabular-nums', low ? 'text-destructive' : 'text-foreground')}>
						${balance.toFixed(2)}
						<span class="font-normal text-muted-foreground">/ ${allowance.toFixed(2)}</span>
					</p>
					{#if low}<p class="text-[11px] font-medium text-destructive">Low — contact support to top up</p>{/if}
				</div>
			</div>
		{/if}

		{#if !flags.feature_automation_engine}
			<div class="mb-5 rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
				<p class="font-semibold text-foreground">Automation isn’t enabled for your plan</p>
				<p class="mt-1">Contact your agency to enable automation. You can still see the available controls below.</p>
			</div>
		{/if}

		{#if loading}
			<div class="flex flex-col gap-3">
				<SkeletonLoader lines={8} label="Loading automation settings" height="84px" />
			</div>
		{:else}
			<div class="flex flex-col gap-9">
				<!-- Engine-backed automations -->
				{#each CATEGORIES as cat (cat)}
					<section class="flex flex-col gap-3">
						<h2 class="px-0.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">{cat}</h2>
						<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
							{#each cardsIn(cat) as card (card.key)}
								<div class={cn(expandedKey === card.key && 'lg:col-span-2')}>
									<SequenceCard
										{card}
										sequence={sequenceFor(card)}
										featureEnabled={cardFeatureEnabled(card)}
										expanded={expandedKey === card.key}
										onToggle={() => toggleExpand(card.key)}
										onSaved={onSequenceSaved}
									/>
								</div>
							{/each}
						</div>
					</section>
				{/each}

				<!-- Flat (non-sequence) cards -->
				{#if flatForm}
					<section class="flex flex-col gap-3">
						<h2 class="px-0.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
							Confirmations, reviews & receipts
						</h2>
						<form
							class="contents"
							onsubmit={(e) => {
								e.preventDefault();
								void saveFlat();
							}}
						>
							<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
								<!-- Booking confirmation -->
								<div class={cn(expandedKey === 'appointment_confirmation' && 'lg:col-span-2')}>
									<AutomationCardShell
										icon={CARD_VISUALS.appointment_confirmation.icon}
										accent={CARD_VISUALS.appointment_confirmation.accent}
										title="Booking confirmation"
										description="Instantly text and email customers after they self-book. Includes a calendar invite (.ics)."
										meta={`${flatForm.appointment_confirmation_enabled ? 'Active' : 'Off'} · Text + Email`}
										locked={!flags.feature_appointment_reminders}
										lockedReason="Appointment automations aren't included in your plan — upgrade to enable"
										bind:enabled={flatForm.appointment_confirmation_enabled}
										expanded={expandedKey === 'appointment_confirmation'}
										onToggle={() => toggleExpand('appointment_confirmation')}
									>
										<div class="flex flex-col gap-3">
											<div class="flex flex-col gap-1.5">
												<Label for="ac_sms">SMS message <span class="text-destructive">*</span></Label>
												<Textarea id="ac_sms" bind:value={flatForm.appointment_confirmation_sms_message} maxlength={500} />
												<p class="text-xs text-muted-foreground">
													Variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>,
													<code>{'{appointment_datetime}'}</code>, <code>{'{appointment_date}'}</code>,
													<code>{'{appointment_time}'}</code>, <code>{'{appointment_type}'}</code>, <code>{'{location}'}</code>.
												</p>
												{#if flatErrors.appointment_confirmation_sms_message}<p class="text-xs text-destructive">{flatErrors.appointment_confirmation_sms_message}</p>{/if}
											</div>
											<div class="flex flex-col gap-1.5">
												<Label for="ac_subject">Email subject <span class="text-destructive">*</span></Label>
												<Input id="ac_subject" bind:value={flatForm.appointment_confirmation_email_subject} maxlength={200} />
												{#if flatErrors.appointment_confirmation_email_subject}<p class="text-xs text-destructive">{flatErrors.appointment_confirmation_email_subject}</p>{/if}
											</div>
											<div class="flex flex-col gap-1.5">
												<Label for="ac_email">Email body <span class="text-destructive">*</span></Label>
												<Textarea id="ac_email" bind:value={flatForm.appointment_confirmation_email_message} maxlength={2000} rows={8} />
												<p class="text-xs text-muted-foreground">Same variables as the SMS, plus <code>{'{location_block}'}</code>.</p>
												{#if flatErrors.appointment_confirmation_email_message}<p class="text-xs text-destructive">{flatErrors.appointment_confirmation_email_message}</p>{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>

								<!-- Review funnel -->
								<div class={cn(expandedKey === 'review_funnel' && 'lg:col-span-2')}>
									<AutomationCardShell
										icon={CARD_VISUALS.review_funnel.icon}
										accent={CARD_VISUALS.review_funnel.accent}
										title="Review funnel"
										description="Ask happy customers for a review after a completed job."
										meta={`${flatForm.review_funnel_enabled ? 'Active' : 'Off'} · ${flatForm.review_funnel_delay_hours}h delay`}
										locked={!flags.feature_review_funnel || !flags.review_funnel_sms_allowed}
										lockedReason={!flags.feature_review_funnel
											? "Review funnel isn't included in your plan — upgrade to enable"
											: "SMS review funnel isn't included in your plan — upgrade to enable"}
										bind:enabled={flatForm.review_funnel_enabled}
										expanded={expandedKey === 'review_funnel'}
										onToggle={() => toggleExpand('review_funnel')}
									>
										<div class="flex flex-col gap-3">
											<div class="flex flex-col gap-1.5">
												<Label for="rf_d">Delay (hours) <span class="text-destructive">*</span></Label>
												<Input id="rf_d" type="number" min={0} max={720} class="sm:max-w-[160px]" bind:value={flatForm.review_funnel_delay_hours} />
											</div>
											<div class="flex flex-col gap-1.5">
												<Label for="rf_link">Google review link</Label>
												<Input id="rf_link" type="url" placeholder="https://g.page/r/…" bind:value={flatForm.google_review_link} />
												{#if flatErrors.google_review_link}<p class="text-xs text-destructive">{flatErrors.google_review_link}</p>{/if}
											</div>
											<div class="flex flex-col gap-1.5">
												<Label for="rf_msg">Message <span class="text-destructive">*</span></Label>
												<Textarea id="rf_msg" bind:value={flatForm.review_funnel_message} maxlength={500} />
												<p class="text-xs text-muted-foreground">Must include <code class="rounded bg-muted px-1 py-0.5 text-[11px]">{'{review_link}'}</code>.</p>
												{#if flatErrors.review_funnel_message}<p class="text-xs text-destructive">{flatErrors.review_funnel_message}</p>{/if}
											</div>
											<div class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-medium text-foreground">Send a 72-hour reminder</p>
														<p class="text-xs text-muted-foreground">If the customer hasn't responded after 3 days, send one short nudge with the same link.</p>
													</div>
													<Switch bind:checked={flatForm.review_funnel_reminder_enabled} aria-label="Toggle 72-hour review reminder" />
												</div>
												{#if flatForm.review_funnel_reminder_enabled}
													<div class="flex flex-col gap-1.5">
														<Label for="rf_reminder_msg">Reminder message <span class="text-destructive">*</span></Label>
														<Textarea id="rf_reminder_msg" bind:value={flatForm.review_funnel_reminder_message} maxlength={500} />
														<p class="text-xs text-muted-foreground">Keep it short. Must include <code class="rounded bg-muted px-1 py-0.5 text-[11px]">{'{review_link}'}</code>.</p>
														{#if flatErrors.review_funnel_reminder_message}<p class="text-xs text-destructive">{flatErrors.review_funnel_reminder_message}</p>{/if}
													</div>
												{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>

								<!-- Payment receipt -->
								<div class={cn(expandedKey === 'payment_receipt' && 'lg:col-span-2')}>
									<AutomationCardShell
										icon={CARD_VISUALS.payment_receipt.icon}
										accent={CARD_VISUALS.payment_receipt.accent}
										title="Payment receipt"
										description="Email customers a receipt after each payment."
										meta={`${flatForm.payment_receipt_enabled ? 'Active' : 'Off'} · Email${flatForm.payment_receipt_sms_enabled ? ' + Text' : ''}`}
										locked={!flags.feature_payment_receipt}
										lockedReason="Payment receipts aren't included in your plan — upgrade to enable"
										bind:enabled={flatForm.payment_receipt_enabled}
										expanded={expandedKey === 'payment_receipt'}
										onToggle={() => toggleExpand('payment_receipt')}
									>
										<div class="flex flex-col gap-3">
											<div class="flex flex-col gap-1.5">
												<Label for="pr_msg">Email receipt message <span class="text-destructive">*</span></Label>
												<Textarea id="pr_msg" bind:value={flatForm.payment_receipt_message} maxlength={500} />
												<p class="text-xs text-muted-foreground">Allowed variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>, <code>{'{amount}'}</code></p>
												{#if flatErrors.payment_receipt_message}<p class="text-xs text-destructive">{flatErrors.payment_receipt_message}</p>{/if}
											</div>
											<div class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3" class:opacity-60={!flags.payment_receipt_sms_allowed}>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-medium text-foreground">Also send as SMS</p>
														<p class="text-xs text-muted-foreground">Text the receipt to customers without an email on file, or to everyone.</p>
														{#if !flags.payment_receipt_sms_allowed}<p class="mt-1 text-xs text-muted-foreground">SMS receipts aren't included in your plan — upgrade to enable</p>{/if}
													</div>
													<Switch bind:checked={flatForm.payment_receipt_sms_enabled} disabled={!flags.payment_receipt_sms_allowed} aria-label="Toggle SMS payment receipts" />
												</div>
												{#if flatForm.payment_receipt_sms_enabled && flags.payment_receipt_sms_allowed}
													<div class="flex flex-col gap-1.5">
														<Label for="pr_sms_msg">SMS receipt message <span class="text-destructive">*</span></Label>
														<Textarea id="pr_sms_msg" bind:value={flatForm.payment_receipt_sms_message} maxlength={500} />
														<p class="text-xs text-muted-foreground">Keep it short. Allowed variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>, <code>{'{amount}'}</code></p>
														{#if flatErrors.payment_receipt_sms_message}<p class="text-xs text-destructive">{flatErrors.payment_receipt_sms_message}</p>{/if}
													</div>
												{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>
							</div>

							{#if flatDirty}
								<footer class="sticky bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] mt-4 flex items-center justify-end gap-2 rounded-xl border border-border bg-card p-3 shadow-md md:bottom-4">
									<Button
										variant="outline"
										type="button"
										disabled={savingFlat}
										onclick={() => {
											if (flatOriginal) flatForm = { ...flatOriginal };
											flatErrors = {};
										}}
									>
										Reset
									</Button>
									<Button type="submit" disabled={savingFlat}>{savingFlat ? 'Saving…' : 'Save changes'}</Button>
								</footer>
							{/if}
						</form>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</PageWrapper>
