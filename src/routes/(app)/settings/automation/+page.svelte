<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import AutomationToggleCard from '$lib/components/settings/AutomationToggleCard.svelte';
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

	type AutomationForm = {
		updated_at: string;

		missed_call_textback_enabled: boolean;
		missed_call_textback_message: string;

		quote_followup_enabled: boolean;
		quote_followup_delay_1_hours: number;
		quote_followup_delay_2_hours: number;
		quote_followup_message: string;

		invoice_reminder_enabled: boolean;
		invoice_reminder_delay_days: number;
		invoice_reminder_message: string;

		review_funnel_enabled: boolean;
		review_funnel_delay_hours: number;
		google_review_link: string;
		review_funnel_message: string;
		review_funnel_reminder_enabled: boolean;
		review_funnel_reminder_message: string;

		appointment_reminder_enabled: boolean;
		appointment_reminder_hours_before: number;
		appointment_reminder_message: string;
		appointment_reminder_1h_enabled: boolean;
		appointment_reminder_1h_message: string;

		appointment_confirmation_enabled: boolean;
		appointment_confirmation_sms_message: string;
		appointment_confirmation_email_subject: string;
		appointment_confirmation_email_message: string;

		payment_receipt_enabled: boolean;
		payment_receipt_message: string;
		payment_receipt_sms_enabled: boolean;
		payment_receipt_sms_message: string;

		speed_to_lead_enabled: boolean;
		speed_to_lead_message: string;
	};

	const member = getMemberContext();
	const featureFlags = getFeatureFlagsContext();
	let m = $derived(member());
	let flags = $derived(featureFlags());

	let original = $state<AutomationForm | null>(null);
	let form = $state<AutomationForm | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	// Read-only SMS credit snapshot (PO-controlled; contractors can't edit it).
	let smsCredit = $state<{ balance: string; monthly_included_credit: string } | null>(null);

	let dirty = $derived(
		original !== null && form !== null && JSON.stringify(original) !== JSON.stringify(form)
	);

	let changedCount = $derived.by(() => {
		if (!original || !form) return 0;
		let count = 0;
		for (const k of Object.keys(form) as (keyof AutomationForm)[]) {
			if (k === 'updated_at') continue;
			if (form[k] !== original[k]) count++;
		}
		return count;
	});

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
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
			// Non-critical — balance display just stays hidden on failure.
		}
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/settings/automation');
			const body = (await res.json()) as {
				data?: Omit<AutomationForm, 'google_review_link'> & { google_review_link: string | null };
				error?: string;
			};
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Failed to load automation settings');
				return;
			}
			const normalized: AutomationForm = {
				...body.data,
				google_review_link: body.data.google_review_link ?? ''
			};
			original = normalized;
			form = { ...normalized };
		} finally {
			loading = false;
		}
	}

	function validateClient(f: AutomationForm): Record<string, string> {
		const errs: Record<string, string> = {};
		const templateFields = [
			'missed_call_textback_message',
			'quote_followup_message',
			'invoice_reminder_message',
			'review_funnel_message',
			'review_funnel_reminder_message',
			'appointment_reminder_message',
			'appointment_reminder_1h_message',
			'appointment_confirmation_sms_message',
			'appointment_confirmation_email_subject',
			'appointment_confirmation_email_message',
			'payment_receipt_message',
			'payment_receipt_sms_message',
			'speed_to_lead_message'
		] as const;
		for (const k of templateFields) {
			const v = f[k];
			if (typeof v === 'string') {
				const r = validateTemplateVariables(v);
				if (!r.ok) {
					errs[k] = `Unknown variable(s): ${r.unknown.map((u) => `{${u}}`).join(', ')}.`;
				}
			}
		}
		return errs;
	}

	async function save() {
		if (!form || !original) return;
		fieldErrors = validateClient(form);
		if (Object.keys(fieldErrors).length > 0) {
			toast.error('Please fix the highlighted fields');
			return;
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = { updated_at: original.updated_at };
			for (const k of Object.keys(form) as (keyof AutomationForm)[]) {
				if (k === 'updated_at') continue;
				if (form[k] !== original[k]) {
					if (k === 'google_review_link') {
						payload[k] = form[k] === '' ? null : form[k];
					} else {
						payload[k] = form[k];
					}
				}
			}

			if (Object.keys(payload).length === 1) {
				toast.info('No changes to save');
				saving = false;
				return;
			}

			const res = await fetch('/api/settings/automation', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as {
				data?: Omit<AutomationForm, 'google_review_link'> & { google_review_link: string | null };
				error?: string;
				field_errors?: Record<string, string>;
			};

			const normalize = (d: NonNullable<typeof body.data>): AutomationForm => ({
				...d,
				google_review_link: d.google_review_link ?? ''
			});

			if (res.status === 409 && body.data) {
				const n = normalize(body.data);
				original = n;
				form = { ...n };
				toast.error('Settings changed elsewhere. Loaded the latest version.');
				return;
			}

			if (!res.ok) {
				fieldErrors = body.field_errors ?? {};
				toast.error(body.error ?? 'Save failed');
				return;
			}
			if (body.data) {
				const n = normalize(body.data);
				original = n;
				form = { ...n };
				toast.success('Automation settings saved');
			}
		} catch {
			toast.error('Save failed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Automation Settings</title></svelte:head>

<UnsavedChangesGuard {dirty} />

<PageWrapper title="Automation" subtitle="Auto-replies, follow-ups, reminders" back="/settings">
	{#if smsCredit}
		{@const balance = Number(smsCredit.balance)}
		{@const allowance = Number(smsCredit.monthly_included_credit)}
		{@const low = allowance > 0 && balance < allowance * 0.2}
		<div
			class="mb-4 flex items-center gap-3.5 rounded-xl border border-border/60 bg-card px-4 py-3.5 shadow-card"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
			>
				<MessageSquare class="h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-foreground">SMS Credit</p>
				<p class="text-xs text-muted-foreground">
					Texts sent by your automations draw from this balance.
				</p>
			</div>
			<div class="shrink-0 text-right">
				<p
					class={cn(
						'text-sm font-semibold tabular-nums',
						low ? 'text-destructive' : 'text-foreground'
					)}
				>
					${balance.toFixed(2)}
					<span class="font-normal text-muted-foreground">/ ${allowance.toFixed(2)}</span>
				</p>
				{#if low}
					<p class="text-[11px] font-medium text-destructive">Low — contact support to top up</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if !flags.feature_automation_engine}
		<div
			class="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground"
		>
			<p class="font-semibold text-foreground">Automation isn’t enabled for your plan</p>
			<p class="mt-1">
				Contact your agency to enable automation. You can still see the available controls below.
			</p>
		</div>
	{/if}

	{#if loading || !form}
		<div class="mt-4">
			<SkeletonLoader lines={10} label="Loading automation settings" height="64px" />
		</div>
	{:else}
		<form
			class="mt-4 flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<p class="px-1 pt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
				Inbound
			</p>
			<AutomationToggleCard
				title="Missed call text-back"
				description="Reply to missed calls automatically with an SMS."
				featureEnabled={flags.feature_missed_call_textback}
				lockedReason="Not enabled for your plan"
				bind:enabled={form.missed_call_textback_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="mctb_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea id="mctb_msg" bind:value={form.missed_call_textback_message} maxlength={500} />
					<p class="text-xs text-muted-foreground">
						Allowed variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>
					</p>
					{#if fieldErrors.missed_call_textback_message}
						<p class="text-xs text-destructive">{fieldErrors.missed_call_textback_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<AutomationToggleCard
				title="Speed to lead"
				description="Auto-acknowledge new leads within seconds."
				featureEnabled={flags.feature_speed_to_lead}
				lockedReason="Speed to lead isn't included in your plan — upgrade to enable"
				bind:enabled={form.speed_to_lead_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="stl_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea id="stl_msg" bind:value={form.speed_to_lead_message} maxlength={500} />
					{#if fieldErrors.speed_to_lead_message}
						<p class="text-xs text-destructive">{fieldErrors.speed_to_lead_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<p class="px-1 pt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
				Follow-ups
			</p>

			<AutomationToggleCard
				title="Quote follow-up"
				description="Nudge customers after you send a quote."
				featureEnabled={flags.feature_quote_followup && flags.quote_followup_sms_allowed}
				lockedReason={!flags.feature_quote_followup
					? "Quote follow-up isn't included in your plan — upgrade to enable"
					: "SMS quote follow-ups aren't included in your plan — upgrade to enable"}
				bind:enabled={form.quote_followup_enabled}
			>
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="qf_d1">First reminder (hours) <span class="text-destructive">*</span></Label
						>
						<Input
							id="qf_d1"
							type="number"
							min={0}
							max={720}
							bind:value={form.quote_followup_delay_1_hours}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="qf_d2"
							>Second reminder (hours) <span class="text-destructive">*</span></Label
						>
						<Input
							id="qf_d2"
							type="number"
							min={0}
							max={720}
							bind:value={form.quote_followup_delay_2_hours}
						/>
					</div>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="qf_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea id="qf_msg" bind:value={form.quote_followup_message} maxlength={500} />
					{#if fieldErrors.quote_followup_message}
						<p class="text-xs text-destructive">{fieldErrors.quote_followup_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<AutomationToggleCard
				title="Invoice reminder"
				description="Remind customers when an invoice is due."
				featureEnabled={flags.feature_invoice_reminders && flags.invoice_reminder_sms_allowed}
				lockedReason={!flags.feature_invoice_reminders
					? "Invoice reminders aren't included in your plan — upgrade to enable"
					: "SMS invoice reminders aren't included in your plan — upgrade to enable"}
				bind:enabled={form.invoice_reminder_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="ir_d">Delay (days) <span class="text-destructive">*</span></Label>
					<Input
						id="ir_d"
						type="number"
						min={0}
						max={90}
						bind:value={form.invoice_reminder_delay_days}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="ir_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea id="ir_msg" bind:value={form.invoice_reminder_message} maxlength={500} />
					{#if fieldErrors.invoice_reminder_message}
						<p class="text-xs text-destructive">{fieldErrors.invoice_reminder_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<AutomationToggleCard
				title="Review funnel"
				description="Send review requests after a completed job."
				featureEnabled={flags.feature_review_funnel && flags.review_funnel_sms_allowed}
				lockedReason={!flags.feature_review_funnel
					? "Review funnel isn't included in your plan — upgrade to enable"
					: "SMS review funnel isn't included in your plan — upgrade to enable"}
				bind:enabled={form.review_funnel_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="rf_d">Delay (hours) <span class="text-destructive">*</span></Label>
					<Input
						id="rf_d"
						type="number"
						min={0}
						max={720}
						bind:value={form.review_funnel_delay_hours}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="rf_link">Google review link</Label>
					<Input
						id="rf_link"
						type="url"
						placeholder="https://g.page/r/…"
						bind:value={form.google_review_link}
					/>
					{#if fieldErrors.google_review_link}
						<p class="text-xs text-destructive">{fieldErrors.google_review_link}</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="rf_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea id="rf_msg" bind:value={form.review_funnel_message} maxlength={500} />
					<p class="text-xs text-muted-foreground">
						Must include <code class="rounded bg-muted px-1 py-0.5 text-[11px]"
							>{'{review_link}'}</code
						>
						— the public review link is the primary call to action.
					</p>
					{#if fieldErrors.review_funnel_message}
						<p class="text-xs text-destructive">{fieldErrors.review_funnel_message}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-medium text-foreground">Send a 72-hour reminder</p>
							<p class="text-xs text-muted-foreground">
								If the customer hasn't responded after 3 days, send one short nudge with the same
								link. We won't send a reminder once they've rated, opted out, or the link expires.
							</p>
						</div>
						<Switch
							bind:checked={form.review_funnel_reminder_enabled}
							aria-label="Toggle 72-hour review reminder"
						/>
					</div>

					{#if form.review_funnel_reminder_enabled}
						<div class="flex flex-col gap-1.5">
							<Label for="rf_reminder_msg">
								Reminder message <span class="text-destructive">*</span>
							</Label>
							<Textarea
								id="rf_reminder_msg"
								bind:value={form.review_funnel_reminder_message}
								maxlength={500}
							/>
							<p class="text-xs text-muted-foreground">
								Keep it short. Must include
								<code class="rounded bg-muted px-1 py-0.5 text-[11px]">{'{review_link}'}</code>.
							</p>
							{#if fieldErrors.review_funnel_reminder_message}
								<p class="text-xs text-destructive">
									{fieldErrors.review_funnel_reminder_message}
								</p>
							{/if}
						</div>
					{/if}
				</div>
			</AutomationToggleCard>

			<p class="px-1 pt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
				Appointments
			</p>
			<AutomationToggleCard
				title="Booking confirmation"
				description="Instantly text and email customers after they self-book online. Includes a calendar invite (.ics)."
				featureEnabled={flags.feature_appointment_reminders}
				lockedReason="Appointment automations aren't included in your plan — upgrade to enable"
				bind:enabled={form.appointment_confirmation_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="ac_sms">
						SMS message <span class="text-destructive">*</span>
					</Label>
					<Textarea
						id="ac_sms"
						bind:value={form.appointment_confirmation_sms_message}
						maxlength={500}
					/>
					<p class="text-xs text-muted-foreground">
						Variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>,
						<code>{'{appointment_datetime}'}</code>, <code>{'{appointment_date}'}</code>,
						<code>{'{appointment_time}'}</code>, <code>{'{appointment_type}'}</code>,
						<code>{'{location}'}</code>.
					</p>
					{#if fieldErrors.appointment_confirmation_sms_message}
						<p class="text-xs text-destructive">
							{fieldErrors.appointment_confirmation_sms_message}
						</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="ac_subject">
						Email subject <span class="text-destructive">*</span>
					</Label>
					<Input
						id="ac_subject"
						bind:value={form.appointment_confirmation_email_subject}
						maxlength={200}
					/>
					{#if fieldErrors.appointment_confirmation_email_subject}
						<p class="text-xs text-destructive">
							{fieldErrors.appointment_confirmation_email_subject}
						</p>
					{/if}
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="ac_email">
						Email body <span class="text-destructive">*</span>
					</Label>
					<Textarea
						id="ac_email"
						bind:value={form.appointment_confirmation_email_message}
						maxlength={2000}
						rows={8}
					/>
					<p class="text-xs text-muted-foreground">
						Same variables as the SMS, plus <code>{'{location_block}'}</code> (renders a "Where:" line
						only when a location is set).
					</p>
					{#if fieldErrors.appointment_confirmation_email_message}
						<p class="text-xs text-destructive">
							{fieldErrors.appointment_confirmation_email_message}
						</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<AutomationToggleCard
				title="Appointment reminder"
				description="Remind customers ahead of their appointment."
				featureEnabled={flags.feature_appointment_reminders &&
					flags.appointment_reminder_sms_allowed}
				lockedReason={!flags.feature_appointment_reminders
					? "Appointment reminders aren't included in your plan — upgrade to enable"
					: "SMS appointment reminders aren't included in your plan — upgrade to enable"}
				bind:enabled={form.appointment_reminder_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="ar_h">Hours before <span class="text-destructive">*</span></Label>
					<Input
						id="ar_h"
						type="number"
						min={0}
						max={720}
						bind:value={form.appointment_reminder_hours_before}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="ar_msg">24-hour message <span class="text-destructive">*</span></Label>
					<Textarea id="ar_msg" bind:value={form.appointment_reminder_message} maxlength={500} />
					{#if fieldErrors.appointment_reminder_message}
						<p class="text-xs text-destructive">{fieldErrors.appointment_reminder_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<AutomationToggleCard
				title="1-hour appointment reminder"
				description="Send a second reminder 1 hour before the appointment."
				featureEnabled={flags.feature_appointment_reminders &&
					flags.appointment_reminder_sms_allowed}
				lockedReason={!flags.feature_appointment_reminders
					? "Appointment reminders aren't included in your plan — upgrade to enable"
					: "SMS appointment reminders aren't included in your plan — upgrade to enable"}
				bind:enabled={form.appointment_reminder_1h_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="ar1h_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea
						id="ar1h_msg"
						bind:value={form.appointment_reminder_1h_message}
						maxlength={500}
					/>
					<p class="text-xs text-muted-foreground">
						Allowed variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>
					</p>
					{#if fieldErrors.appointment_reminder_1h_message}
						<p class="text-xs text-destructive">{fieldErrors.appointment_reminder_1h_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<p class="px-1 pt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
				Payments
			</p>
			<AutomationToggleCard
				title="Payment receipt"
				description="Email customers a receipt after each payment."
				featureEnabled={flags.feature_payment_receipt}
				lockedReason="Payment receipts aren't included in your plan — upgrade to enable"
				bind:enabled={form.payment_receipt_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="pr_msg">Email receipt message <span class="text-destructive">*</span></Label>
					<Textarea id="pr_msg" bind:value={form.payment_receipt_message} maxlength={500} />
					<p class="text-xs text-muted-foreground">
						Allowed variables: <code>{'{contact_name}'}</code>, <code>{'{org_name}'}</code>,
						<code>{'{amount}'}</code>
					</p>
					{#if fieldErrors.payment_receipt_message}
						<p class="text-xs text-destructive">{fieldErrors.payment_receipt_message}</p>
					{/if}
				</div>

				<div
					class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
					class:opacity-60={!flags.payment_receipt_sms_allowed}
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-medium text-foreground">Also send as SMS</p>
							<p class="text-xs text-muted-foreground">
								Text the receipt to customers without an email on file, or to every customer.
							</p>
							{#if !flags.payment_receipt_sms_allowed}
								<p class="mt-1 text-xs text-muted-foreground">
									SMS receipts aren't included in your plan — upgrade to enable
								</p>
							{/if}
						</div>
						<Switch
							bind:checked={form.payment_receipt_sms_enabled}
							disabled={!flags.payment_receipt_sms_allowed}
							aria-label="Toggle SMS payment receipts"
						/>
					</div>

					{#if form.payment_receipt_sms_enabled && flags.payment_receipt_sms_allowed}
						<div class="flex flex-col gap-1.5">
							<Label for="pr_sms_msg"
								>SMS receipt message <span class="text-destructive">*</span></Label
							>
							<Textarea
								id="pr_sms_msg"
								bind:value={form.payment_receipt_sms_message}
								maxlength={500}
							/>
							<p class="text-xs text-muted-foreground">
								Keep it short. Allowed variables: <code>{'{contact_name}'}</code>,
								<code>{'{org_name}'}</code>, <code>{'{amount}'}</code>
							</p>
							{#if fieldErrors.payment_receipt_sms_message}
								<p class="text-xs text-destructive">{fieldErrors.payment_receipt_sms_message}</p>
							{/if}
						</div>
					{/if}
				</div>
			</AutomationToggleCard>

			<footer
				class="sticky bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] flex items-center justify-end gap-2 rounded-lg border border-border bg-card p-3 shadow-md md:bottom-4"
			>
				<Button
					variant="outline"
					type="button"
					disabled={saving || !dirty}
					onclick={() => {
						if (original) form = { ...original };
						fieldErrors = {};
					}}
				>
					Reset
				</Button>
				<Button type="submit" disabled={saving || !dirty}>
					{saving
						? 'Saving…'
						: changedCount === 1
							? 'Save 1 change'
							: `Save ${changedCount} changes`}
				</Button>
			</footer>
		</form>
	{/if}
</PageWrapper>
