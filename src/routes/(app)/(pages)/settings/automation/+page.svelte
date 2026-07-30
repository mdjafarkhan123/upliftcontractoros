<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import SequenceCard from '$lib/components/settings/automation/SequenceCard.svelte';
	import AutomationCardShell from '$lib/components/settings/automation/AutomationCardShell.svelte';
	import { CARD_VISUALS } from '$lib/components/settings/automation/cardVisuals';
	import UnsavedChangesGuard from '$lib/components/settings/UnsavedChangesGuard.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { validateTemplateVariables } from '$lib/utils/validation/templateVariables';
	import CommunicationWorkflowManager from '$lib/components/settings/automation/CommunicationWorkflowManager.svelte';
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
		job_scheduled_confirmation_enabled: boolean;
		job_scheduled_sms_message: string;
		job_scheduled_email_subject: string;
		job_scheduled_email_message: string;
		job_on_my_way_enabled: boolean;
		job_on_my_way_sms_message: string;
		job_on_my_way_email_subject: string;
		job_on_my_way_email_message: string;
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
		'job_scheduled_confirmation_enabled',
		'job_scheduled_sms_message',
		'job_scheduled_email_subject',
		'job_scheduled_email_message',
		'job_on_my_way_enabled',
		'job_on_my_way_sms_message',
		'job_on_my_way_email_subject',
		'job_on_my_way_email_message',
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
		flatOriginal !== null &&
			flatForm !== null &&
			JSON.stringify(flatOriginal) !== JSON.stringify(flatForm)
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
			const body = (await res.json()) as {
				data?: { balance: string; monthly_included_credit: string };
			};
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
			job_scheduled_confirmation_enabled: Boolean(d.job_scheduled_confirmation_enabled),
			job_scheduled_sms_message: String(d.job_scheduled_sms_message),
			job_scheduled_email_subject: String(d.job_scheduled_email_subject),
			job_scheduled_email_message: String(d.job_scheduled_email_message),
			job_on_my_way_enabled: Boolean(d.job_on_my_way_enabled),
			job_on_my_way_sms_message: String(d.job_on_my_way_sms_message),
			job_on_my_way_email_subject: String(d.job_on_my_way_email_subject),
			job_on_my_way_email_message: String(d.job_on_my_way_email_message),
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

			const seqBody = (await seqRes.json()) as {
				data?: { sequences: ApiSequence[] };
				error?: string;
			};
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
			'job_scheduled_sms_message',
			'job_scheduled_email_subject',
			'job_scheduled_email_message',
			'job_on_my_way_sms_message',
			'job_on_my_way_email_subject',
			'job_on_my_way_email_message',
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
		if (
			typeof f.review_funnel_message === 'string' &&
			!f.review_funnel_message.includes('{review_link}')
		) {
			errs.review_funnel_message = 'Must include {review_link}.';
		}
		if (
			typeof f.review_funnel_reminder_message === 'string' &&
			!f.review_funnel_reminder_message.includes('{review_link}')
		) {
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
	<div class="automation-page">
		{#if smsCredit}
			{@const balance = Number(smsCredit.balance)}
			{@const allowance = Number(smsCredit.monthly_included_credit)}
			{@const low = allowance > 0 && balance < allowance * 0.2}
			<div class="auto-sms">
				<span class="auto-tile auto-tile--violet auto-sms__tile">
					<i class="ri-message-2-line" aria-hidden="true"></i>
				</span>
				<div class="auto-sms__body">
					<p class="auto-sms__title">SMS Credit</p>
					<p class="auto-sms__sub">Texts sent by your automations draw from this balance.</p>
				</div>
				<div class="auto-sms__right">
					<p class="auto-sms__amount" class:auto-sms__amount--low={low}>
						${balance.toFixed(2)}
						<span class="auto-sms__allowance">/ ${allowance.toFixed(2)}</span>
					</p>
					{#if low}<p class="auto-sms__warn">Low — contact support to top up</p>{/if}
				</div>
			</div>
		{/if}

		{#if !flags.feature_automation_engine}
			<div class="auto-notice">
				<p class="auto-notice__title">Automation isn’t enabled for your plan</p>
				<p class="auto-notice__text">
					Contact your agency to enable automation. You can still see the available controls below.
				</p>
			</div>
		{/if}

		{#if loading}
			<SkeletonLoader lines={8} label="Loading automation settings" height="84px" />
		{:else}
			<div class="automation-page__sections">
				<CommunicationWorkflowManager />

				<!-- Engine-backed automations -->
				{#each CATEGORIES as cat (cat)}
					<section class="auto-section">
						<h2 class="auto-section__title">{cat}</h2>
						<div class="auto-grid">
							{#each cardsIn(cat) as card (card.key)}
								<div class="auto-grid__cell" class:auto-grid__cell--wide={expandedKey === card.key}>
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
					<section class="auto-section">
						<h2 class="auto-section__title">Confirmations, reviews &amp; receipts</h2>
						<form
							class="auto-section__form"
							onsubmit={(e) => {
								e.preventDefault();
								void saveFlat();
							}}
						>
							<div class="auto-grid">
								<!-- Booking confirmation -->
								<div
									class="auto-grid__cell"
									class:auto-grid__cell--wide={expandedKey === 'appointment_confirmation'}
								>
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
										<div class="auto-fields">
											<div class="field">
												<Label for="ac_sms" class="field__label field__label--required"
													>SMS message</Label
												>
												<Textarea
													id="ac_sms"
													bind:value={flatForm.appointment_confirmation_sms_message}
													maxlength={500}
												/>
												<p class="field__hint">
													Variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>,
													<code>{'{appointment_datetime}'}</code>,
													<code>{'{appointment_date}'}</code>,
													<code>{'{appointment_time}'}</code>, <code>{'{appointment_type}'}</code>,
													<code>{'{location}'}</code>.
												</p>
												{#if flatErrors.appointment_confirmation_sms_message}<p
														class="field__error"
													>
														{flatErrors.appointment_confirmation_sms_message}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="ac_subject" class="field__label field__label--required"
													>Email subject</Label
												>
												<Input
													id="ac_subject"
													bind:value={flatForm.appointment_confirmation_email_subject}
													maxlength={200}
												/>
												{#if flatErrors.appointment_confirmation_email_subject}<p
														class="field__error"
													>
														{flatErrors.appointment_confirmation_email_subject}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="ac_email" class="field__label field__label--required"
													>Email body</Label
												>
												<Textarea
													id="ac_email"
													bind:value={flatForm.appointment_confirmation_email_message}
													maxlength={2000}
													rows={8}
												/>
												<p class="field__hint">
													Same variables as the SMS, plus <code>{'{location_block}'}</code>.
												</p>
												{#if flatErrors.appointment_confirmation_email_message}<p
														class="field__error"
													>
														{flatErrors.appointment_confirmation_email_message}
													</p>{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>

								<!-- Job scheduled confirmation -->
								<div
									class="auto-grid__cell"
									class:auto-grid__cell--wide={expandedKey === 'job_scheduled_confirmation'}
								>
									<AutomationCardShell
										icon={CARD_VISUALS.job_scheduled_confirmation.icon}
										accent={CARD_VISUALS.job_scheduled_confirmation.accent}
										title="Job scheduled confirmation"
										description="Text and email the customer when you schedule their job, if you pick a notify channel on the job."
										meta={`${flatForm.job_scheduled_confirmation_enabled ? 'Active' : 'Off'} · Text + Email`}
										bind:enabled={flatForm.job_scheduled_confirmation_enabled}
										expanded={expandedKey === 'job_scheduled_confirmation'}
										onToggle={() => toggleExpand('job_scheduled_confirmation')}
									>
										<div class="auto-fields">
											<div class="field">
												<Label for="js_sms" class="field__label field__label--required"
													>SMS message</Label
												>
												<Textarea
													id="js_sms"
													bind:value={flatForm.job_scheduled_sms_message}
													maxlength={500}
												/>
												<p class="field__hint">
													Variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>,
													<code>{'{job_title}'}</code>, <code>{'{scheduled_datetime}'}</code>.
												</p>
												{#if flatErrors.job_scheduled_sms_message}<p class="field__error">
														{flatErrors.job_scheduled_sms_message}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="js_subject" class="field__label field__label--required"
													>Email subject</Label
												>
												<Input
													id="js_subject"
													bind:value={flatForm.job_scheduled_email_subject}
													maxlength={200}
												/>
												{#if flatErrors.job_scheduled_email_subject}<p class="field__error">
														{flatErrors.job_scheduled_email_subject}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="js_email" class="field__label field__label--required"
													>Email body</Label
												>
												<Textarea
													id="js_email"
													bind:value={flatForm.job_scheduled_email_message}
													maxlength={2000}
													rows={8}
												/>
												<p class="field__hint">Same variables as the SMS.</p>
												{#if flatErrors.job_scheduled_email_message}<p class="field__error">
														{flatErrors.job_scheduled_email_message}
													</p>{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>

								<!-- Job "on my way" -->
								<div
									class="auto-grid__cell"
									class:auto-grid__cell--wide={expandedKey === 'job_on_my_way'}
								>
									<AutomationCardShell
										icon={CARD_VISUALS.job_on_my_way.icon}
										accent={CARD_VISUALS.job_on_my_way.accent}
										title="On my way"
										description="Lets your team tap “On my way” on a job to text or email the customer that you're heading over."
										meta={`${flatForm.job_on_my_way_enabled ? 'Active' : 'Off'} · Text + Email`}
										bind:enabled={flatForm.job_on_my_way_enabled}
										expanded={expandedKey === 'job_on_my_way'}
										onToggle={() => toggleExpand('job_on_my_way')}
									>
										<div class="auto-fields">
											<div class="field">
												<Label for="omw_sms" class="field__label field__label--required"
													>SMS message</Label
												>
												<Textarea
													id="omw_sms"
													bind:value={flatForm.job_on_my_way_sms_message}
													maxlength={500}
												/>
												<p class="field__hint">
													Variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>,
													<code>{'{job_title}'}</code>.
												</p>
												{#if flatErrors.job_on_my_way_sms_message}<p class="field__error">
														{flatErrors.job_on_my_way_sms_message}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="omw_subject" class="field__label field__label--required"
													>Email subject</Label
												>
												<Input
													id="omw_subject"
													bind:value={flatForm.job_on_my_way_email_subject}
													maxlength={200}
												/>
												{#if flatErrors.job_on_my_way_email_subject}<p class="field__error">
														{flatErrors.job_on_my_way_email_subject}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="omw_email" class="field__label field__label--required"
													>Email body</Label
												>
												<Textarea
													id="omw_email"
													bind:value={flatForm.job_on_my_way_email_message}
													maxlength={2000}
													rows={8}
												/>
												<p class="field__hint">Same variables as the SMS.</p>
												{#if flatErrors.job_on_my_way_email_message}<p class="field__error">
														{flatErrors.job_on_my_way_email_message}
													</p>{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>

								<!-- Review funnel -->
								<div
									class="auto-grid__cell"
									class:auto-grid__cell--wide={expandedKey === 'review_funnel'}
								>
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
										<div class="auto-fields">
											<div class="field">
												<Label for="rf_d" class="field__label field__label--required"
													>Delay (hours)</Label
												>
												<Input
													id="rf_d"
													type="number"
													min={0}
													max={720}
													class="auto-fields__narrow"
													bind:value={flatForm.review_funnel_delay_hours}
												/>
											</div>
											<div class="field">
												<Label for="rf_link" class="field__label">Google review link</Label>
												<Input
													id="rf_link"
													type="url"
													placeholder="https://g.page/r/…"
													bind:value={flatForm.google_review_link}
												/>
												{#if flatErrors.google_review_link}<p class="field__error">
														{flatErrors.google_review_link}
													</p>{/if}
											</div>
											<div class="field">
												<Label for="rf_msg" class="field__label field__label--required"
													>Message</Label
												>
												<Textarea
													id="rf_msg"
													bind:value={flatForm.review_funnel_message}
													maxlength={500}
												/>
												<p class="field__hint">
													Must include <code class="auto-fields__code">{'{review_link}'}</code>.
												</p>
												{#if flatErrors.review_funnel_message}<p class="field__error">
														{flatErrors.review_funnel_message}
													</p>{/if}
											</div>
											<div class="auto-subcard">
												<div class="auto-subcard__row">
													<div class="auto-subcard__text">
														<p class="auto-subcard__title">Send a 72-hour reminder</p>
														<p class="auto-subcard__desc">
															If the customer hasn't responded after 3 days, send one short nudge
															with the same link.
														</p>
													</div>
													<Switch
														bind:checked={flatForm.review_funnel_reminder_enabled}
														aria-label="Toggle 72-hour review reminder"
													/>
												</div>
												{#if flatForm.review_funnel_reminder_enabled}
													<div class="field">
														<Label for="rf_reminder_msg" class="field__label field__label--required"
															>Reminder message</Label
														>
														<Textarea
															id="rf_reminder_msg"
															bind:value={flatForm.review_funnel_reminder_message}
															maxlength={500}
														/>
														<p class="field__hint">
															Keep it short. Must include <code class="auto-fields__code"
																>{'{review_link}'}</code
															>.
														</p>
														{#if flatErrors.review_funnel_reminder_message}<p class="field__error">
																{flatErrors.review_funnel_reminder_message}
															</p>{/if}
													</div>
												{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>

								<!-- Payment receipt -->
								<div
									class="auto-grid__cell"
									class:auto-grid__cell--wide={expandedKey === 'payment_receipt'}
								>
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
										<div class="auto-fields">
											<div class="field">
												<Label for="pr_msg" class="field__label field__label--required"
													>Email receipt message</Label
												>
												<Textarea
													id="pr_msg"
													bind:value={flatForm.payment_receipt_message}
													maxlength={500}
												/>
												<p class="field__hint">
													Allowed variables: <code>{'{contact_name}'}</code>,
													<code>{'{org_name}'}</code>, <code>{'{amount}'}</code>
												</p>
												{#if flatErrors.payment_receipt_message}<p class="field__error">
														{flatErrors.payment_receipt_message}
													</p>{/if}
											</div>
											<div
												class="auto-subcard"
												class:auto-subcard--muted={!flags.payment_receipt_sms_allowed}
											>
												<div class="auto-subcard__row">
													<div class="auto-subcard__text">
														<p class="auto-subcard__title">Also send as SMS</p>
														<p class="auto-subcard__desc">
															Text the receipt to customers without an email on file, or to
															everyone.
														</p>
														{#if !flags.payment_receipt_sms_allowed}<p class="auto-subcard__note">
																SMS receipts aren't included in your plan — upgrade to enable
															</p>{/if}
													</div>
													<Switch
														bind:checked={flatForm.payment_receipt_sms_enabled}
														disabled={!flags.payment_receipt_sms_allowed}
														aria-label="Toggle SMS payment receipts"
													/>
												</div>
												{#if flatForm.payment_receipt_sms_enabled && flags.payment_receipt_sms_allowed}
													<div class="field">
														<Label for="pr_sms_msg" class="field__label field__label--required"
															>SMS receipt message</Label
														>
														<Textarea
															id="pr_sms_msg"
															bind:value={flatForm.payment_receipt_sms_message}
															maxlength={500}
														/>
														<p class="field__hint">
															Keep it short. Allowed variables: <code>{'{contact_name}'}</code>,
															<code>{'{org_name}'}</code>, <code>{'{amount}'}</code>
														</p>
														{#if flatErrors.payment_receipt_sms_message}<p class="field__error">
																{flatErrors.payment_receipt_sms_message}
															</p>{/if}
													</div>
												{/if}
											</div>
										</div>
									</AutomationCardShell>
								</div>
							</div>

							{#if flatDirty}
								<footer class="auto-savebar">
									<Button
										variant="outline"
										disabled={savingFlat}
										onclick={() => {
											if (flatOriginal) flatForm = { ...flatOriginal };
											flatErrors = {};
										}}
									>
										Reset
									</Button>
									<Button type="submit" loading={savingFlat} loadingLabel="Saving…">
										Save changes
									</Button>
								</footer>
							{/if}
						</form>
					</section>
				{/if}
			</div>
		{/if}
	</div>
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.automation-page {
		width: 100%;
		max-width: 1024px;
		margin: 0 auto;
		padding-bottom: $space-16;

		&__sections {
			display: flex;
			flex-direction: column;
			gap: $space-8;
		}
	}
</style>
