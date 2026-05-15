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
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getFeatureFlagsContext } from '$lib/context/featureFlags';
	import { validateTemplateVariables } from '$lib/utils/validation/templateVariables';

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

		appointment_reminder_enabled: boolean;
		appointment_reminder_hours_before: number;
		appointment_reminder_message: string;

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

	let dirty = $derived(
		original !== null && form !== null && JSON.stringify(original) !== JSON.stringify(form)
	);

	onMount(() => {
		if (m.role !== 'admin') {
			goto('/settings');
			return;
		}
		void load();
	});

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
			'appointment_reminder_message',
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

<PageWrapper title="Automation" subtitle="Auto-replies, follow-ups, reminders">
	{#if !flags.feature_automation_engine}
		<div class="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
			<p class="font-semibold text-foreground">Automation isn’t enabled for your plan</p>
			<p class="mt-1">
				Contact your agency to enable automation. You can still see the available controls below.
			</p>
		</div>
	{/if}

	{#if loading || !form}
		<div class="mt-4"><SkeletonLoader lines={10} label="Loading automation settings" height="64px" /></div>
	{:else}
		<form
			class="mt-4 flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<AutomationToggleCard
				title="Missed call text-back"
				description="Reply to missed calls automatically with an SMS."
				featureEnabled={flags.feature_missed_call_textback}
				lockedReason="Not enabled for your plan"
				bind:enabled={form.missed_call_textback_enabled}
			>
				<div class="flex flex-col gap-1.5">
					<Label for="mctb_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea
						id="mctb_msg"
						bind:value={form.missed_call_textback_message}
						maxlength={500}
					/>
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

			<AutomationToggleCard
				title="Quote follow-up"
				description="Nudge customers after you send a quote."
				bind:enabled={form.quote_followup_enabled}
			>
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="qf_d1">First reminder (hours) <span class="text-destructive">*</span></Label>
						<Input
							id="qf_d1"
							type="number"
							min={0}
							max={720}
							bind:value={form.quote_followup_delay_1_hours}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="qf_d2">Second reminder (hours) <span class="text-destructive">*</span></Label>
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
				featureEnabled={flags.feature_invoice_reminders}
				lockedReason="Not enabled for your plan"
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
				featureEnabled={flags.feature_review_funnel}
				lockedReason="Not enabled for your plan"
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
					{#if fieldErrors.review_funnel_message}
						<p class="text-xs text-destructive">{fieldErrors.review_funnel_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<AutomationToggleCard
				title="Appointment reminder"
				description="Remind customers ahead of their appointment."
				featureEnabled={flags.feature_appointment_reminders}
				lockedReason="Not enabled for your plan"
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
					<Label for="ar_msg">Message <span class="text-destructive">*</span></Label>
					<Textarea id="ar_msg" bind:value={form.appointment_reminder_message} maxlength={500} />
					{#if fieldErrors.appointment_reminder_message}
						<p class="text-xs text-destructive">{fieldErrors.appointment_reminder_message}</p>
					{/if}
				</div>
			</AutomationToggleCard>

			<footer
				class="sticky bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] flex items-center justify-end gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-md backdrop-blur md:bottom-4"
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
					{saving ? 'Saving…' : 'Save changes'}
				</Button>
			</footer>
		</form>
	{/if}
</PageWrapper>
