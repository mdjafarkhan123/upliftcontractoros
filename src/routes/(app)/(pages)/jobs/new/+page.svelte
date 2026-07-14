<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import JobTagsEditor from '$lib/components/jobs/JobTagsEditor.svelte';
	import JobTypePicker from '$lib/components/jobs/JobTypePicker.svelte';
	import JobBillingEditor from '$lib/components/jobs/JobBillingEditor.svelte';
	import JobRecurringBillingEditor from '$lib/components/jobs/JobRecurringBillingEditor.svelte';
	import JobScheduleEditor from '$lib/components/jobs/JobScheduleEditor.svelte';
	import JobProductsPricing from '$lib/components/jobs/JobProductsPricing.svelte';
	import JobScopeNotes from '$lib/components/jobs/JobScopeNotes.svelte';
	import JobCustomFieldsInput from '$lib/components/jobs/JobCustomFieldsInput.svelte';
	import JobStatusBadge from '$lib/components/jobs/JobStatusBadge.svelte';
	import RecurringScheduleModal from '$lib/components/jobs/RecurringScheduleModal.svelte';
	import ContactPicker from '$lib/components/shared/ContactPicker.svelte';
	import type { ContactHit } from '$lib/components/shared/contactPicker';
	import { JobFormState, defaultNotifyChannel } from '$lib/jobs/jobForm.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { getMemberContext } from '$lib/context/member';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const canAssign = $derived(member().can_view_full_pipeline);

	// Shared job-form state model — the same model the detail-page edit mode uses, so the two
	// screens stay in lockstep. Page-specific concerns (contact search, prefill, POST) live below.
	const form = new JobFormState();
	// Jobber "date today, time empty": a new one-off job defaults its date to today with the
	// times left blank (create-only — the edit page loads the job's real values instead).
	{
		const d = new Date();
		form.scheduledStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	// ── Prefill (from quote) ────────────────────────────────────────────────────
	type LineDraftFromQuote = {
		line_key: string;
		description: string;
		details: string | null;
		quantity: string;
		unit: string | null;
		section_label: string | null;
		unit_price: string;
		unit_cost: string | null;
		taxable: boolean;
		source_catalog_item_id: string | null;
		position: number;
	};
	type PrefillData = {
		title: string;
		contact_id: string;
		contact_name: string;
		contact_phone: string | null;
		contact_email: string | null;
		opportunity_id: string | null;
		quote_number_display: string;
		notes: string | null;
		service_address: {
			line1: string | null;
			line2: string | null;
			city: string | null;
			state: string | null;
			zip: string | null;
		};
		discount_type: string;
		discount_value: string | null;
		discount_label: string | null;
		tax_rate: string;
		line_items: LineDraftFromQuote[];
	};
	let prefill = $state<PrefillData | null>(null);
	let prefillLoading = $state(false);

	// ── Contact selection (manual creation) ────────────────────────────────────
	// The shared ContactPicker owns the search UI/state; we keep only the selection.
	let selectedContact = $state<ContactHit | null>(null);

	// ── Service address (sourced from the selected client) ─────────────────────
	// The job's service address is never typed here for a manually-picked client —
	// it's pulled from the contact's saved primary address (Jobber/Housecall pattern).
	// Editing happens on the contact record, so the fields stay locked.
	type AddressHit = {
		address_line_1: string;
		address_line_2: string | null;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
	};
	let addressLoading = $state(false);
	let addressOnFile = $state(true);
	// Contact whose address backs the service-address block (manual pick or from-quote).
	const addressContactId = $derived(
		data.fromQuoteId ? (prefill?.contact_id ?? null) : (selectedContact?.id ?? null)
	);

	// ── UI state ────────────────────────────────────────────────────────────────
	let errors = $state<Record<string, string>>({});
	let globalError = $state('');
	let saving = $state(false);
	// Custom field values (S7) — bound from JobCustomFieldsInput; sent so the server can
	// enforce the org's required-field gate. Empty when the org has defined no custom fields.
	let customFieldValues = $state<import('$lib/types/jobs').JobCustomFieldValuePayload[]>([]);

	// ── Derived ─────────────────────────────────────────────────────────────────
	const assignedToName = $derived(
		form.assignees.find((a) => a.id === form.assignedToId)?.full_name ?? ''
	);

	// The datetime this job will actually land on the calendar with — or null when it won't
	// (Schedule later, or a recurring job without an anchor). Drives the status-badge preview and
	// whether the client-notification picker is relevant. A one-off is "scheduled" whenever it has
	// a date — timed OR "Anytime" (date with no clock time, Jobber's model). An Anytime date is
	// anchored at noon so the Today/Upcoming read matches what we send to the server.
	const previewStart = $derived.by(() => {
		if (form.jobMode === 'recurring') return form.scheduledStart || null;
		if (form.scheduleLater || !form.scheduledStart) return null;
		if (form.scheduledStart.includes('T')) return form.scheduledStart;
		return `${form.scheduledStart.split('T')[0]}T12:00:00`;
	});

	function initials(name: string): string {
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('');
	}

	// ── Contact selection (shared ContactPicker) ─────────────────────────────────
	// On pick: default the notify channel from the client's reachable channels, clear any
	// required-field error, and pull their saved address into the locked service-address block.
	function onSelectContact(c: ContactHit) {
		form.notifyChannel = defaultNotifyChannel(!!c.phone, !!c.email);
		errors = { ...errors, contact: '' };
		void loadContactAddress(c.id);
	}

	function onClearContact() {
		form.notifyChannel = 'none';
		// Drop the address that belonged to the previous client.
		form.addrLine1 = '';
		form.addrLine2 = '';
		form.addrCity = '';
		form.addrState = '';
		form.addrZip = '';
		addressOnFile = true;
	}

	// Pull the client's primary (or first) saved address into the locked service-address
	// fields. No address on file → fields stay empty and we prompt to add one on the contact.
	async function loadContactAddress(id: string) {
		addressLoading = true;
		addressOnFile = true;
		try {
			const res = await fetch(`/api/contacts/${id}/addresses`);
			if (!res.ok) return;
			const body = (await res.json()) as { data: AddressHit[] };
			const list = body.data ?? [];
			const primary = list.find((a) => a.is_primary) ?? list[0];
			if (primary) {
				form.addrLine1 = primary.address_line_1 ?? '';
				form.addrLine2 = primary.address_line_2 ?? '';
				form.addrCity = primary.city ?? '';
				form.addrState = primary.state ?? '';
				form.addrZip = primary.zip ?? '';
			} else {
				form.addrLine1 = '';
				form.addrLine2 = '';
				form.addrCity = '';
				form.addrState = '';
				form.addrZip = '';
				addressOnFile = false;
			}
		} finally {
			addressLoading = false;
		}
	}

	// ── Save ────────────────────────────────────────────────────────────────────
	async function save() {
		errors = {};
		globalError = '';

		const contactId = data.fromQuoteId ? prefill?.contact_id : selectedContact?.id;
		if (!contactId) {
			errors = { ...errors, contact: 'Please select a contact.' };
			return;
		}
		if (!form.title.trim()) {
			errors = { ...errors, title: 'Job title is required.' };
			return;
		}
		// One-off job: only a date is required (it defaults to today). A time is optional — a date
		// with no time is a valid "Anytime" visit (Jobber's model) that lands in the calendar's
		// Anytime lane. Only "Schedule later" opts out of a date entirely.
		if (form.jobMode === 'one_off' && !form.scheduleLater && !form.scheduledStart) {
			errors = { ...errors, scheduledStart: 'Pick a date, or choose Schedule later.' };
			return;
		}
		if (
			!form.scheduleLater &&
			form.scheduledEnd &&
			form.scheduledStart &&
			new Date(form.scheduledEnd) < new Date(form.scheduledStart)
		) {
			errors = { ...errors, scheduledEnd: 'End must be after start.' };
			return;
		}
		if (form.jobMode === 'recurring') {
			if (!form.recurConfigured) {
				errors = { ...errors, recurrence: 'Set up the repeat rule first.' };
				return;
			}
			if (!form.scheduledStart) {
				errors = { ...errors, scheduledStart: 'Pick a start date for the recurring schedule.' };
				return;
			}
			if (form.endType === 'on' && !form.endOn) {
				errors = { ...errors, end_on: 'Set an end date.' };
				return;
			}
			if (
				form.endType === 'after' &&
				(!Number(form.endAfterCount) || Number(form.endAfterCount) < 1)
			) {
				errors = { ...errors, end_after_count: 'Set how long the schedule runs.' };
				return;
			}
			if (form.preview && form.preview.count === 0) {
				errors = { ...errors, recurrence: 'This schedule produces no visits. Adjust the rule.' };
				return;
			}
			if (
				form.recurBillingEnabled &&
				form.recurBillingType === 'fixed' &&
				!(Number(form.fixedInvoiceAmount) > 0)
			) {
				errors = { ...errors, fixed_invoice_amount: 'Enter the fixed invoice amount.' };
				return;
			}
		}

		// One-off billing: the payment schedule can never bill more than the job total.
		if (form.paymentOverAllocated) {
			globalError =
				'The payment schedule bills more than the job total. Lower an amount to continue.';
			return;
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = {
				contact_id: contactId,
				title: form.title.trim()
			};
			if (prefill?.opportunity_id) payload.opportunity_id = prefill.opportunity_id;
			if (form.assignedToId) payload.assigned_to = form.assignedToId;
			if (form.jobType.trim()) payload.job_type = form.jobType.trim();
			if (form.tags.length > 0) payload.tags = form.tags;

			if (form.jobMode === 'recurring') {
				// A recurring job is always scheduled — the anchor (start/end) drives every
				// generated visit. anytime is carried inside the recurrence rule.
				payload.scheduled_start = new Date(form.scheduledStart).toISOString();
				if (form.scheduledEnd) payload.scheduled_end = new Date(form.scheduledEnd).toISOString();
				payload.recurrence = form.buildRecurrence();
				if (form.visitInstructions.trim())
					payload.visit_instructions = form.visitInstructions.trim();
				if (form.notifyChannel !== 'none') payload.notify_channel = form.notifyChannel;
				// Recurring billing config (manual v1). Only sent when the contractor opts in.
				if (form.recurBillingEnabled) {
					payload.billing_type = form.recurBillingType;
					payload.invoice_frequency = form.invoiceFrequency;
					payload.fixed_invoice_amount =
						form.recurBillingType === 'fixed' ? Number(form.fixedInvoiceAmount) || 0 : null;
				}
			} else if (form.scheduleLater) {
				// Jobber "Schedule later": no date is sent; the server creates a single
				// unscheduled placeholder visit the contractor dates later.
				payload.schedule_later = true;
			} else if (!form.anytime && form.scheduledStart.includes('T')) {
				// Timed one-off: date + start time, optional end.
				payload.scheduled_start = new Date(form.scheduledStart).toISOString();
				if (form.scheduledEnd) payload.scheduled_end = new Date(form.scheduledEnd).toISOString();
				// Only notify the client when a channel is selected (Not set = stay silent).
				if (form.notifyChannel !== 'none') payload.notify_channel = form.notifyChannel;
			} else if (form.scheduledStart) {
				// Anytime one-off: a date with no clock time (Jobber "Anytime" visit) — either the
				// contractor turned on "All day / Anytime", or simply left the time blank. Anchor the
				// date at noon (DST-safe day bucket, same as the appointment form) and mark it all-day
				// so the server creates a dated all-day visit in the calendar's Anytime lane.
				const dateOnly = form.scheduledStart.split('T')[0];
				payload.scheduled_start = new Date(`${dateOnly}T12:00:00`).toISOString();
				payload.all_day = true;
				if (form.notifyChannel !== 'none') payload.notify_channel = form.notifyChannel;
			}
			// Per-job message override — only sent when the contractor edited the wording for
			// this job (otherwise the worker uses the org default template).
			if (payload.notify_channel) {
				const ov = form.buildNotifyOverrides();
				if (ov.sms) payload.notify_sms_message = ov.sms;
				if (ov.subject) payload.notify_email_subject = ov.subject;
				if (ov.body) payload.notify_email_message = ov.body;
			}
			if (form.scopeOfWork.trim()) payload.scope_of_work = form.scopeOfWork.trim();
			if (form.notes.trim()) payload.notes = form.notes.trim();
			if (form.addrLine1.trim()) payload.service_address_line_1 = form.addrLine1.trim();
			if (form.addrLine2.trim()) payload.service_address_line_2 = form.addrLine2.trim();
			if (form.addrCity.trim()) payload.service_address_city = form.addrCity.trim();
			if (form.addrState.trim()) payload.service_address_state = form.addrState.trim();
			if (form.addrZip.trim()) payload.service_address_zip = form.addrZip.trim();

			payload.tax_rate = form.taxRate;
			if (form.discountType !== 'none') {
				payload.discount_type = form.discountType;
				payload.discount_value = Number(form.discountValue) || 0;
				if (form.discountLabel.trim()) payload.discount_label = form.discountLabel.trim();
			}

			const lines = form.lineItems
				.filter((li) => li.description.trim())
				.map((li, idx) => ({
					line_key: li.line_key ?? null,
					description: li.description.trim(),
					details: li.details?.trim() || null,
					quantity: li.quantity,
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					unit_price: li.unit_price,
					unit_cost: li.unit_cost ?? null,
					taxable: li.taxable ?? true,
					source_catalog_item_id: li.source_catalog_item_id ?? null,
					position: idx
				}));
			if (lines.length > 0) payload.line_items = lines;

			// One-off billing: close reminder + optional payment schedule. Only applies to one-off
			// jobs (recurring jobs use recurring billing, handled above). Only rows with a positive
			// amount are sent; incomplete rows are dropped.
			if (form.jobMode === 'one_off' && form.invoiceOnClose) payload.invoice_on_close = true;
			if (form.jobMode === 'one_off' && form.splitEnabled) {
				const ms = form.billingMilestones
					.filter((m) => m.description.trim() && Number(m.amount_value) > 0)
					.map((m) => ({
						key: m.key ?? null,
						description: m.description.trim(),
						amount_type: form.splitBy,
						amount_value: Number(m.amount_value),
						due_date: m.due_date || null
					}));
				if (ms.length > 0) payload.payment_milestones = ms;
			}

			// Custom fields (S7): always send when the org has defined any, so the server can
			// enforce the required-field gate (all-empty rows are ignored for storage).
			if (customFieldValues.length > 0) payload.custom_field_values = customFieldValues;

			const res = await fetch('/api/jobs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = (await res.json()) as {
				job?: { id: string };
				error?: string;
				field_errors?: Record<string, string>;
			};
			if (!res.ok || !body.job) {
				globalError = body.error ?? 'Could not create job.';
				if (body.field_errors) errors = { ...errors, ...body.field_errors };
				return;
			}
			toast.success('Job created successfully');
			await goto(`/jobs/${body.job.id}`);
		} catch {
			globalError = 'Network error. Please try again.';
		} finally {
			saving = false;
		}
	}

	// ── Mount ───────────────────────────────────────────────────────────────────
	onMount(async () => {
		const tasks: Promise<void>[] = [];

		// Load the "job scheduled" confirmation template up front so the preview is ready by
		// the time the contractor picks a schedule (no spinner in the common case).
		tasks.push(form.loadNotifyTemplate());

		if (canAssign) {
			tasks.push(
				fetch('/api/contacts/assignees').then(async (res) => {
					if (!res.ok) return;
					const a = (await res.json()) as { assignees: { id: string; full_name: string }[] };
					form.assignees = a.assignees;
				})
			);
		}

		if (data.fromQuoteId) {
			prefillLoading = true;
			tasks.push(
				fetch(`/api/quotes/${data.fromQuoteId}/job-prefill`)
					.then(async (res) => {
						if (!res.ok) {
							globalError = 'Could not load quote data.';
							return;
						}
						const body = (await res.json()) as { data: PrefillData };
						prefill = body.data;
						form.title = prefill.title;
						form.notifyChannel = defaultNotifyChannel(
							!!prefill.contact_phone,
							!!prefill.contact_email
						);
						form.notes = prefill.notes ?? '';
						form.addrLine1 = prefill.service_address.line1 ?? '';
						form.addrLine2 = prefill.service_address.line2 ?? '';
						form.addrCity = prefill.service_address.city ?? '';
						form.addrState = prefill.service_address.state ?? '';
						form.addrZip = prefill.service_address.zip ?? '';
						form.discountType = (prefill.discount_type as typeof form.discountType) ?? 'none';
						form.discountValue = prefill.discount_value ?? '';
						form.discountLabel = prefill.discount_label ?? '';
						const rate = Number(prefill.tax_rate);
						form.taxRatePct = rate > 0 ? String(Math.round(rate * 10000) / 100) : '';
						form.lineItems = prefill.line_items.map((li) => ({
							client_id: crypto.randomUUID(),
							line_key: li.line_key,
							description: li.description,
							details: li.details ?? '',
							quantity: li.quantity,
							unit: li.unit ?? '',
							section_label: li.section_label,
							unit_price: li.unit_price,
							unit_cost: li.unit_cost,
							taxable: li.taxable,
							source_catalog_item_id: li.source_catalog_item_id
						}));
					})
					.catch(() => {
						globalError = 'Could not load quote data.';
					})
					.finally(() => {
						prefillLoading = false;
					})
			);
		}

		await Promise.all(tasks);
	});
</script>

<svelte:head><title>New Job</title></svelte:head>

<PageWrapper title="New Job" back="/jobs">
	{#snippet actions()}
		<Button onclick={save} loading={saving} loadingLabel="Creating…">
			<i class="ri-briefcase-line" aria-hidden="true"></i>
			Create Job
		</Button>
	{/snippet}

	<div class="job-layout">
		<!-- ── LEFT COLUMN ───────────────────────────────────────────────────── -->
		<div class="job-layout__main">
			<!-- Job title -->
			<div class="job-section">
				<div class="field">
					<h3 id="job-title-heading" class="field__label--required">Job title</h3>
					<input
						id="job-title"
						class="field__input"
						bind:value={form.title}
						placeholder="e.g. Fence repair, Lawn cleanup, HVAC tune-up"
					/>
					{#if errors.title}
						<p class="field__error">{errors.title}</p>
					{/if}
				</div>
			</div>

			<!-- Schedule -->
			<JobScheduleEditor
				{form}
				{errors}
				notifyVisible={previewStart !== null}
				showNotifyHint
				showNotifyPreview
				notifyContactName={data.fromQuoteId
					? (prefill?.contact_name ?? '')
					: (selectedContact?.full_name ?? '')}
				contactSelected={data.fromQuoteId ? !!prefill : !!selectedContact}
				contactHasPhone={data.fromQuoteId ? !!prefill?.contact_phone : !!selectedContact?.phone}
				contactHasEmail={data.fromQuoteId ? !!prefill?.contact_email : !!selectedContact?.email}
			/>

			<!-- Status — auto-derived: no date = Pending, date set = Scheduled. Advances to In
				 progress / Completed later via the job's Start / Complete actions. -->
			<div class="job-new-status">
				<span class="job-new-status__label">Status</span>
				<JobStatusBadge status="scheduled" scheduledStart={previewStart} />
				<span class="job-new-status__hint">
					{previewStart
						? 'Scheduled — on the calendar. Start it from the job when work begins.'
						: form.scheduleLater
							? 'No date yet — saved to the job’s Visits list as “To be scheduled”.'
							: 'Pending until you add a date. Set a schedule above to put it on the calendar.'}
				</span>
			</div>

			<!-- Products & Services -->
			<JobProductsPricing {form} {errors} loading={!!(prefillLoading && data.fromQuoteId)} />

			<!-- Billing — recurring jobs bill on a schedule; one-off jobs use the payment schedule -->
			{#if form.jobMode === 'recurring'}
				<JobRecurringBillingEditor
					bind:enabled={form.recurBillingEnabled}
					bind:billingType={form.recurBillingType}
					bind:invoiceFrequency={form.invoiceFrequency}
					bind:fixedAmount={form.fixedInvoiceAmount}
					preview={form.preview}
					previewLoading={form.previewLoading}
				/>
			{:else}
				<JobBillingEditor
					bind:invoiceOnClose={form.invoiceOnClose}
					bind:splitEnabled={form.splitEnabled}
					bind:splitBy={form.splitBy}
					bind:milestones={form.billingMilestones}
					total={form.total}
				/>
			{/if}

			<!-- Scope of work + Internal notes -->
			<JobScopeNotes {form} />

			<!-- Custom fields (Session 7) — org-defined extra fields; renders only when defined -->
			<JobCustomFieldsInput bind:values={customFieldValues} {errors} />

			{#if globalError}
				<div class="ui-alert ui-alert--destructive">{globalError}</div>
			{/if}
		</div>

		<!-- ── RIGHT SIDEBAR ─────────────────────────────────────────────────── -->
		<div class="job-layout__sidebar">
			<!-- Provenance badge (from-quote flow) -->
			{#if data.fromQuoteId}
				{#if prefillLoading}
					<div class="job-section"><SkeletonLoader lines={2} /></div>
				{:else if prefill}
					<div class="job-provenance">
						<i class="ri-file-text-line job-provenance__icon" aria-hidden="true"></i>
						<p class="job-provenance__text">
							From Quote <span class="job-provenance__num">{prefill.quote_number_display}</span>
						</p>
					</div>
				{/if}
			{/if}

			<!-- Client section -->
			{#if data.fromQuoteId}
				{#if prefillLoading}
					<div class="job-section"><SkeletonLoader lines={3} /></div>
				{:else if prefill}
					<div class="job-section">
						<p class="job-eyebrow">Client</p>
						<div class="job-new-client">
							<div class="job-new-client__avatar">{initials(prefill.contact_name)}</div>
							<div class="job-new-client__info">
								<p class="job-new-client__name">{prefill.contact_name}</p>
								{#if prefill.contact_phone}
									<a href="tel:{prefill.contact_phone}" class="job-new-client__row">
										<i class="ri-phone-line" aria-hidden="true"></i>
										{prefill.contact_phone}
									</a>
								{/if}
								{#if prefill.contact_email}
									<p class="job-new-client__row">
										<i class="ri-mail-line" aria-hidden="true"></i>
										<span class="job-new-client__email">{prefill.contact_email}</span>
									</p>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Manual contact search -->
				<div class="job-section">
					<p class="job-eyebrow">Client <span class="job-eyebrow__req">*</span></p>
					<ContactPicker
						bind:selected={selectedContact}
						placeholder="Select a client — search by name or phone"
						invalid={!!errors.contact}
						onSelect={onSelectContact}
						onClear={onClearContact}
					/>
					{#if errors.contact}
						<p class="field__error">{errors.contact}</p>
					{/if}
				</div>
			{/if}

			<!-- Service address -->
			<div class="job-section">
				<div class="job-addr-header">
					<p class="job-eyebrow">Service Address</p>
					{#if form.mapsUrl}
						<a
							href={form.mapsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="job-addr-maps-link"
						>
							<i class="ri-external-link-line" aria-hidden="true"></i>
							Open in Maps
						</a>
					{/if}
				</div>
				{#if data.fromQuoteId}
					<!-- From a quote: the address is the quote's snapshot, editable here. -->
					<div class="job-addr-fields">
						<input class="field__input" placeholder="Address line 1" bind:value={form.addrLine1} />
						<input
							class="field__input"
							placeholder="Address line 2 (optional)"
							bind:value={form.addrLine2}
						/>
						<div class="job-addr-city-row">
							<input class="field__input" placeholder="City" bind:value={form.addrCity} />
							<input class="field__input" placeholder="State" bind:value={form.addrState} />
						</div>
						<input class="field__input" placeholder="ZIP code" bind:value={form.addrZip} />
					</div>
					{#if prefillLoading}
						<div class="new-job__addr-skeleton"><SkeletonLoader lines={2} /></div>
					{/if}
				{:else if !addressContactId}
					<!-- No client yet — address comes from the client's contact record. -->
					<p class="job-addr-hint">
						<i class="ri-information-line" aria-hidden="true"></i>
						Select a client first — the service address is pulled from their contact record.
					</p>
				{:else if addressLoading}
					<div class="new-job__addr-skeleton"><SkeletonLoader lines={2} /></div>
				{:else}
					<!-- Locked: address is owned by the contact. Edit it there, not here. -->
					<div class="job-addr-fields">
						<input
							class="field__input"
							placeholder="Address line 1"
							value={form.addrLine1}
							disabled
						/>
						<input
							class="field__input"
							placeholder="Address line 2 (optional)"
							value={form.addrLine2}
							disabled
						/>
						<div class="job-addr-city-row">
							<input class="field__input" placeholder="City" value={form.addrCity} disabled />
							<input class="field__input" placeholder="State" value={form.addrState} disabled />
						</div>
						<input class="field__input" placeholder="ZIP code" value={form.addrZip} disabled />
					</div>
					{#if addressOnFile}
						<p class="job-addr-hint">
							<i class="ri-lock-2-line" aria-hidden="true"></i>
							Pulled from the client's contact.
							<a href="/contacts/{addressContactId}">Edit in contact</a>.
						</p>
					{:else}
						<p class="job-addr-hint job-addr-hint--warn">
							<i class="ri-alert-line" aria-hidden="true"></i>
							No address on file for this client.
							<a href="/contacts/{addressContactId}">Add one on their contact</a>.
						</p>
					{/if}
				{/if}
			</div>

			<!-- Job type & tags -->
			<div class="job-section">
				<div class="field">
					<p class="field__label">Job type</p>
					<JobTypePicker bind:value={form.jobType} />
				</div>

				<div class="job-section-divider"></div>

				<div class="field">
					<p class="field__label">
						<i class="ri-price-tag-3-line" aria-hidden="true"></i> Tags
					</p>
					<JobTagsEditor bind:value={form.tags} />
				</div>
			</div>

			<!-- Assigned technician -->
			{#if canAssign}
				<div class="job-section">
					<div class="field">
						<p class="field__label">Assigned technician</p>
						{#if form.assignedToId && assignedToName}
							<div class="job-assignee-section">
								<div>
									<span class="job-assignee-chip">
										<i class="ri-user-line" aria-hidden="true"></i>
										{assignedToName}
										<button
											type="button"
											class="job-assignee-chip__remove"
											onclick={() => {
												form.assignedToId = '';
												form.notifyAssignee = false;
											}}
											aria-label="Remove assignee"
										>
											<i class="ri-close-line" aria-hidden="true"></i>
										</button>
									</span>
								</div>
								<div class="job-toggle-row">
									<div class="job-toggle-row__text">
										<p class="job-toggle-row__title">Notify {assignedToName}</p>
										<p class="job-toggle-row__hint">Send an alert when job is created</p>
									</div>
									<Switch id="notify-switch" bind:checked={form.notifyAssignee} />
								</div>
							</div>
						{:else}
							<Select.Root bind:value={form.assignedToId}>
								<Select.Trigger>
									<Select.Value placeholder="Select a team member" />
								</Select.Trigger>
								<Select.Content>
									{#each form.assignees as a (a.id)}
										<Select.Item value={a.id}>{a.full_name}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</PageWrapper>

<RecurringScheduleModal
	bind:open={form.recurModalOpen}
	value={form.recurShape}
	onsave={form.onRecurSaved}
/>

<!-- Mobile sticky action bar -->
<div class="job-mobile-bar">
	<button
		type="button"
		class="btn btn--outline btn--full"
		onclick={() => goto('/jobs')}
		disabled={saving}
	>
		Cancel
	</button>
	<Button type="button" class="btn--full" loading={saving} loadingLabel="Creating…" onclick={save}>
		Create Job
	</Button>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.new-job__addr-skeleton {
		margin-top: $space-3;
	}

	.job-new-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: $space-2;

		&__label {
			font-size: $fs-body;
			font-weight: 600;
			color: var(--color-text-primary);
		}

		&__hint {
			flex-basis: 100%;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}
	}
</style>
