<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		milestoneAmount,
		milestoneStatus,
		billingProgress,
		pctOf,
		MILESTONE_STATUS_LABEL,
		BILLING_TYPE_LABEL,
		BILLING_REPEAT_LABEL,
		INVOICE_FREQUENCY_LABEL,
		reminderDisplayStatus,
		REMINDER_DISPLAY_LABEL,
		type InvoiceFrequency
	} from '$lib/jobs/billing';
	import { summarizeRecurrence, type JobRecurrence } from '$lib/jobs/recurrence';
	import type { JobDetail, JobPaymentMilestoneRow, JobInvoiceReminderRow } from '$lib/types/jobs';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tabs from '$lib/components/ui/tabs';
	import InvoiceStatusBadge from '$lib/components/invoices/InvoiceStatusBadge.svelte';
	import InvoiceReminderFormDialog from './InvoiceReminderFormDialog.svelte';
	import InvoiceReminderDetailPopover from './InvoiceReminderDetailPopover.svelte';
	import SelectVisitsToInvoiceDialog from './SelectVisitsToInvoiceDialog.svelte';

	let {
		job,
		canInvoice,
		onEdit,
		onInvoiced
	}: {
		job: JobDetail;
		canInvoice: boolean;
		// Opens the "Edit invoice settings" modal (Jobber). Also fired by the Payment Schedule pencil
		// and the "Add Invoice to Payment Schedule" link (the schedule rows are edited in that modal).
		onEdit?: () => void;
		// Fired after an invoice is created here so the parent can refresh the job's invoices feed.
		onInvoiced?: () => void;
	} = $props();

	const total = $derived(Number(job.total));
	const milestones = $derived(job.payment_milestones);
	const hasSchedule = $derived(milestones.length > 0);
	const frequency = $derived(job.billing_frequency);
	const isRecurring = $derived(job.job_type === 'recurring');
	const cadence = $derived(job.invoice_frequency as InvoiceFrequency | null);

	// Periodic invoicing label (Jobber "Invoice frequency"): the friendly summary of the invoice
	// recurrence rule (e.g. "Monthly on the last day"), falling back to the legacy thin cadence for
	// rows saved before invoice_recurrence existed.
	const periodicLabel = $derived(
		job.invoice_recurrence
			? summarizeRecurrence({ ...job.invoice_recurrence, end_type: 'after' } as JobRecurrence)
			: cadence
				? INVOICE_FREQUENCY_LABEL[cadence]
				: ''
	);

	// Recurring header meta "Frequency" value — Jobber's exact option wording for the resting freq.
	const recurringFreqLabel = $derived(
		frequency === 'periodic'
			? periodicLabel || 'On a repeating schedule'
			: BILLING_REPEAT_LABEL[frequency]
	);

	// The Invoicing tab shows an invoices grid (Jobber ref/billing/20) for any job that can produce
	// an invoice on demand: visit-based (bills its visits) or periodic fixed (snapshots line items).
	const canGenerate = $derived(job.billing_type === 'visit_based' || frequency === 'periodic');
	const isVisitBased = $derived(job.billing_type === 'visit_based');

	const progress = $derived(billingProgress(milestones, total));
	const segments = $derived([
		{ key: 'paid', label: 'Paid', value: progress.paid, cls: 'paid' },
		{ key: 'awaiting', label: 'Awaiting Payment', value: progress.awaiting, cls: 'awaiting' },
		{ key: 'draft', label: 'Draft', value: progress.draft, cls: 'draft' },
		{ key: 'remaining', label: 'Remaining', value: progress.remaining, cls: 'remaining' }
	]);

	function rowTotal(m: JobPaymentMilestoneRow): number {
		if (m.invoice_id && m.invoice_total != null) return Number(m.invoice_total);
		return milestoneAmount(m.amount_type, Number(m.amount_value), total);
	}
	function rowBalance(m: JobPaymentMilestoneRow): number {
		if (m.invoice_id && m.invoice_total != null) {
			return Math.max(0, Number(m.invoice_total) - Number(m.invoice_amount_paid ?? 0));
		}
		return milestoneAmount(m.amount_type, Number(m.amount_value), total);
	}

	const scheduleTotal = $derived(milestones.reduce((s, m) => s + rowTotal(m), 0));
	const scheduleBalance = $derived(milestones.reduce((s, m) => s + rowBalance(m), 0));

	const subtotal = $derived(Number(job.subtotal));
	const discount = $derived(Number(job.discount_amount ?? 0));
	const taxAmount = $derived(Number(job.tax_amount ?? 0));

	type BadgeVariant = 'default' | 'brand' | 'dark' | 'success' | 'warning' | 'danger' | 'info';

	const MILESTONE_BADGE: Record<string, BadgeVariant> = {
		paid: 'success',
		awaiting: 'warning',
		draft: 'default',
		upcoming: 'default',
		cancelled: 'danger'
	};

	const REMINDER_BADGE: Record<string, BadgeVariant> = {
		completed: 'success',
		today: 'brand',
		late: 'danger',
		upcoming: 'default',
		unscheduled: 'default'
	};

	const CREATE_ROW_BADGE: Record<string, BadgeVariant> = {
		today: 'brand',
		late: 'danger',
		upcoming: 'default'
	};

	let tab = $state<'invoicing' | 'reminders'>('invoicing');

	let creatingId = $state<string | null>(null);
	let generating = $state(false);

	async function createInvoice(m: JobPaymentMilestoneRow) {
		creatingId = m.id;
		try {
			const res = await fetch(`/api/jobs/${job.id}/payment-schedule/${m.id}/invoice`, {
				method: 'POST'
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not create invoice.');
				return;
			}
			const d = body.data as {
				id: string;
				invoice_number_display: string;
				already_existed: boolean;
			};
			toast.success(
				d.already_existed
					? `Invoice ${d.invoice_number_display} already exists`
					: `Invoice ${d.invoice_number_display} created`
			);
			await goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			creatingId = null;
		}
	}

	// Direct generate (periodic FIXED only): snapshots the job's line items into a fresh period
	// invoice. Visit-based jobs go through the select-visits picker instead (they bill visits).
	async function generateInvoice() {
		generating = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/generate-invoice`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not generate the invoice.');
				return;
			}
			const d = body.data as { id: string; invoice_number_display: string; visit_count: number };
			toast.success(`Invoice ${d.invoice_number_display} created`);
			onInvoiced?.();
			await goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			generating = false;
		}
	}

	// ── Invoicing grid + "Select visits to invoice" picker (Jobber ref/billing/20-21) ──────────
	// For a visit-based job the Invoicing tab shows a single "Create" row when there is work to
	// bill; its status/total come from the billable-visit set (uninvoiced ≤ today + the next
	// upcoming). Loaded lazily when the tab is active. Clicking Create opens the picker modal.
	let selectVisitsOpen = $state(false);
	let billableLoading = $state(false);
	let billableLoaded = $state(false);
	let billableCount = $state(0);
	let billableStatus = $state<'late' | 'today' | 'upcoming' | null>(null);
	let billableSubtotal = $state(0);

	async function loadBillable() {
		billableLoading = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/billable-visits`);
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				const d = body.data as {
					job: { status: 'late' | 'today' | 'upcoming' | null; subtotal: string };
					visits: { id: string }[];
				};
				billableCount = d.visits.length;
				billableStatus = d.job.status;
				billableSubtotal = Number(d.job.subtotal);
			}
		} catch {
			// Leave the row hidden on a network hiccup.
		} finally {
			billableLoading = false;
			billableLoaded = true;
		}
	}

	$effect(() => {
		if (
			tab === 'invoicing' &&
			canGenerate &&
			isVisitBased &&
			!hasSchedule &&
			!billableLoaded &&
			!billableLoading
		) {
			void loadBillable();
		}
	});

	// Whether to show the "Create" row: a visit-based job needs billable visits; a periodic fixed
	// job can always snapshot its line items into a new period invoice.
	const showCreateRow = $derived(isVisitBased ? billableCount > 0 : canGenerate);
	// Face for the Create row's Status cell (Jobber shows the rollup — Late/Today/Upcoming).
	const createRowState = $derived(isVisitBased ? (billableStatus ?? 'upcoming') : 'upcoming');
	const CREATE_ROW_LABEL: Record<'late' | 'today' | 'upcoming', string> = {
		late: 'Late',
		today: 'Today',
		upcoming: 'Upcoming'
	};
	const createRowTotal = $derived(isVisitBased ? billableSubtotal : total);

	function startCreate() {
		if (isVisitBased) selectVisitsOpen = true;
		else void generateInvoice();
	}

	// ── Invoice reminders (Jobber ref/billing/5,7,8,16-17) ────────────────────
	// A reminder is a contractor to-do to invoice this job. Loaded lazily the first
	// time the Reminders tab is opened; created/completed/deleted then re-fetched.
	// Jobber paginates the list at 10 per page with a prev/next pager (ref/billing/16-17).
	const REMINDER_PAGE_SIZE = 10;
	let reminders = $state<JobInvoiceReminderRow[]>([]);
	let reminderPage = $state(1);
	let reminderTotal = $state(0);
	let remindersLoaded = $state(false);
	let remindersLoading = $state(false);
	let reminderDialogOpen = $state(false);
	let reminderDialogMode = $state<'new' | 'edit'>('new');
	let editingReminder = $state<JobInvoiceReminderRow | null>(null);
	let busyReminderId = $state<string | null>(null);

	// Invoice Reminder Details popover (Jobber ref/billing/18). Clicking a reminder row opens
	// a free-floating detail card anchored to the row. We key by id + derive the LIVE row so an
	// optimistic complete/reopen shows immediately, and a delete auto-closes the popover (the id
	// falls out of the list). See [[feedback-render-from-store-not-snapshot]].
	let detailReminderId = $state<string | null>(null);
	let detailAnchor = $state<HTMLElement | null>(null);
	const detailReminder = $derived(
		detailReminderId ? (reminders.find((r) => r.id === detailReminderId) ?? null) : null
	);

	function openReminderDetail(r: JobInvoiceReminderRow, el: HTMLElement) {
		detailReminderId = r.id;
		detailAnchor = el;
	}
	function closeReminderDetail() {
		detailReminderId = null;
		detailAnchor = null;
	}
	// The reminder's "Create Invoice" opens the "select visits to invoice" picker (Jobber gap #2).
	function createInvoiceFromReminder() {
		closeReminderDetail();
		selectVisitsOpen = true;
	}

	const reminderPageCount = $derived(Math.max(1, Math.ceil(reminderTotal / REMINDER_PAGE_SIZE)));
	const reminderRangeStart = $derived(
		reminderTotal === 0 ? 0 : (reminderPage - 1) * REMINDER_PAGE_SIZE + 1
	);
	const reminderRangeEnd = $derived(Math.min(reminderPage * REMINDER_PAGE_SIZE, reminderTotal));

	async function loadReminders(page = reminderPage) {
		remindersLoading = true;
		try {
			const res = await fetch(`/api/jobs/${job.id}/reminders?page=${page}`);
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				const d = body.data as { items: JobInvoiceReminderRow[]; total: number; page: number };
				reminders = d.items ?? [];
				reminderTotal = d.total ?? 0;
				reminderPage = d.page ?? page;
			}
		} catch {
			// Leave the list as-is on a network hiccup.
		} finally {
			remindersLoading = false;
			remindersLoaded = true;
		}
	}

	function goToReminderPage(page: number) {
		const target = Math.min(Math.max(1, page), reminderPageCount);
		if (target === reminderPage) return;
		void loadReminders(target);
	}

	// After a delete the current page can empty out — step back if we're past page 1.
	function reloadRemindersAfterDelete() {
		const target = reminders.length === 1 && reminderPage > 1 ? reminderPage - 1 : reminderPage;
		return loadReminders(target);
	}

	$effect(() => {
		if (tab === 'reminders' && !remindersLoaded && !remindersLoading) void loadReminders();
	});

	function reminderWhen(r: JobInvoiceReminderRow): string {
		if (!r.scheduled_start) return 'No date yet';
		if (r.all_day) return `${formatDate(r.scheduled_start)} · Anytime`;
		const time = new Date(r.scheduled_start).toLocaleTimeString([], {
			hour: 'numeric',
			minute: '2-digit'
		});
		return `${formatDate(r.scheduled_start)} · ${time}`;
	}

	function reminderCrew(r: JobInvoiceReminderRow): string {
		if (r.assignees.length === 0) return '—';
		const lead = r.assignees.find((a) => a.is_lead) ?? r.assignees[0];
		const extra = r.assignees.length - 1;
		return extra > 0 ? `${lead.full_name} +${extra}` : lead.full_name;
	}

	function addReminder() {
		reminderDialogMode = 'new';
		editingReminder = null;
		reminderDialogOpen = true;
	}
	function editReminder(r: JobInvoiceReminderRow) {
		if (!canInvoice) return;
		reminderDialogMode = 'edit';
		editingReminder = r;
		reminderDialogOpen = true;
	}

	async function toggleComplete(r: JobInvoiceReminderRow) {
		busyReminderId = r.id;
		try {
			const next = r.status === 'completed' ? 'active' : 'completed';
			const res = await fetch(`/api/jobs/${job.id}/reminders/${r.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Could not update the reminder.');
				return;
			}
			await loadReminders();
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			busyReminderId = null;
		}
	}

	async function deleteReminder(r: JobInvoiceReminderRow) {
		busyReminderId = r.id;
		try {
			const res = await fetch(`/api/jobs/${job.id}/reminders/${r.id}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 204) {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Could not delete the reminder.');
				return;
			}
			await reloadRemindersAfterDelete();
		} catch {
			toast.error('Network error. Please try again.');
		} finally {
			busyReminderId = null;
		}
	}
</script>

<section class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="ri-bill-line job-section__icon" aria-hidden="true"></i>
			<h2 class="job-section__title">Billing</h2>
		</div>
		{#if onEdit}
			<Button variant="outline" size="sm" onclick={onEdit}>Edit Invoice Settings</Button>
		{/if}
	</div>

	<!-- Header subtitle meta (Jobber ref/billing/4,12). -->
	<div class="job-billing__subtitle">
		{#if isRecurring}
			<div class="job-billing__meta">
				<span class="job-billing__meta-label">Frequency</span>
				<span class="job-billing__meta-value">{recurringFreqLabel}</span>
			</div>
			<div class="job-billing__meta">
				<span class="job-billing__meta-label">Billing type</span>
				<span class="job-billing__meta-value">{BILLING_TYPE_LABEL[job.billing_type]}</span>
			</div>
		{:else}
			<div class="job-billing__meta">
				<span class="job-billing__meta-label">Reminders</span>
				<span class="job-billing__meta-value">
					{frequency === 'on_completion' ? 'When the job is marked closed' : 'No reminder set'}
				</span>
			</div>
		{/if}
	</div>

	<!-- Tabs -->
	<Tabs.Root value={tab} onValueChange={(v) => (tab = v as 'invoicing' | 'reminders')}>
		<Tabs.List class="job-billing__tabs-list">
			<Tabs.Trigger value="invoicing" class="job-billing__tab">Invoicing</Tabs.Trigger>
			<Tabs.Trigger value="reminders" class="job-billing__tab">Reminders</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="invoicing" class="job-billing__panel">
		{#if hasSchedule}
			<!-- Payment schedule (fixed-price progress invoicing) — Jobber ref/billing/4. -->
			<div class="job-billing__pay-head">
				<span class="job-billing__pay-title">Payment Schedule</span>
				{#if onEdit}
					<button
						type="button"
						class="job-billing__pencil"
						onclick={onEdit}
						aria-label="Edit payment schedule"
					>
						<i class="ri-pencil-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>

			<div class="job-billing__totalbox">
				<p class="job-billing__totalbox-main">
					Total: <strong>{formatCurrency(total)}</strong>
				</p>
				<p class="job-billing__totalbox-breakdown">
					{formatCurrency(subtotal)} subtotal − {formatCurrency(discount)} discount + {formatCurrency(
						taxAmount
					)} taxes
				</p>
				<div class="job-billing__bar" role="presentation">
					{#each segments as seg (seg.key)}
						{#if seg.value > 0 && total > 0}
							<span
								class="job-billing__bar-seg job-billing__bar-seg--{seg.cls}"
								style="width: {pctOf(seg.value, total)}%"
							></span>
						{/if}
					{/each}
				</div>
				<div class="job-billing__legend">
					{#each segments as seg (seg.key)}
						<span class="job-billing__legend-item">
							<span class="job-billing__dot job-billing__dot--{seg.cls}" aria-hidden="true"></span>
							{seg.label}: {pctOf(seg.value, total)}% ({formatCurrency(seg.value)})
						</span>
					{/each}
				</div>
			</div>

			<table class="job-billing__table">
				<colgroup>
					<col style="width:96px">
					<col style="width:96px">
					<col style="width:132px">
					<col style="width:56px">
					<col>
					<col style="width:128px">
					<col style="width:116px">
				</colgroup>
				<thead>
					<tr>
						<th scope="col">Invoice</th>
						<th scope="col">Due date</th>
						<th scope="col">Status</th>
						<th scope="col" class="job-billing__cell--num">%</th>
						<th scope="col">Description</th>
						<th scope="col" class="job-billing__cell--num">Total</th>
						<th scope="col" class="job-billing__cell--num">Balance</th>
					</tr>
				</thead>
				<tbody>
					{#each milestones as m (m.id)}
						{@const status = milestoneStatus(m)}
						<tr>
							<td>
								{#if m.invoice_id}
									<Button href="/invoices/{m.invoice_id}" variant="secondary" size="sm">View</Button>
								{:else if canInvoice}
									<Button size="sm" loading={creatingId === m.id} onclick={() => createInvoice(m)}>
										Create
									</Button>
								{:else}
									<span class="job-billing__cell--muted">—</span>
								{/if}
							</td>
							<td class="job-billing__cell--muted">{m.due_date ? formatDate(m.due_date) : '—'}</td>
							<td>
								<Badge variant={MILESTONE_BADGE[status]}>
									{m.invoice_number != null ? `#${m.invoice_number} · ` : ''}{MILESTONE_STATUS_LABEL[status]}
								</Badge>
							</td>
							<td class="job-billing__cell--num job-billing__cell--muted">
								{pctOf(rowTotal(m), total)}%
							</td>
							<td class="job-billing__cell--desc">{m.description}</td>
							<td class="job-billing__cell--num">
								{formatCurrency(rowTotal(m))}
								<span class="job-billing__gsub">Subtotal {formatCurrency(rowTotal(m))}</span>
							</td>
							<td class="job-billing__cell--num">{formatCurrency(rowBalance(m))}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						<td colspan="5">Total</td>
						<td class="job-billing__cell--num">
							{formatCurrency(scheduleTotal)}
							<span class="job-billing__gsub">Subtotal {formatCurrency(scheduleTotal)}</span>
						</td>
						<td class="job-billing__cell--num">{formatCurrency(scheduleBalance)}</td>
					</tr>
				</tfoot>
			</table>

			{#if onEdit}
				<div class="job-billing__addrow">
					<button type="button" class="job-billing__add" onclick={onEdit}>
						<i class="ri-add-line" aria-hidden="true"></i>
						Add Invoice to Payment Schedule
					</button>
				</div>
			{/if}
		{:else if canGenerate}
			<table class="job-billing__table">
				<colgroup>
					<col style="width:110px">
					<col style="width:96px">
					<col style="width:132px">
					<col>
					<col style="width:128px">
					<col style="width:116px">
				</colgroup>
				<thead>
					<tr>
						<th scope="col">Invoice</th>
						<th scope="col">Due date</th>
						<th scope="col">Status</th>
						<th scope="col">Subject</th>
						<th scope="col" class="job-billing__cell--num">Total</th>
						<th scope="col" class="job-billing__cell--num">Balance</th>
					</tr>
				</thead>
				<tbody>
					{#each job.invoices as inv (inv.id)}
						<tr>
							<td><Button href="/invoices/{inv.id}" variant="secondary" size="sm">View</Button></td>
							<td class="job-billing__cell--muted">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
							<td><InvoiceStatusBadge status={inv.status} /></td>
							<td class="job-billing__cell--desc">{inv.subject || 'For Services Rendered'}</td>
							<td class="job-billing__cell--num">{formatCurrency(Number(inv.total))}</td>
							<td class="job-billing__cell--num">{formatCurrency(Number(inv.balance))}</td>
						</tr>
					{/each}
					{#if showCreateRow && canInvoice}
						<tr>
							<td>
								<Button size="sm" loading={!isVisitBased && generating} onclick={startCreate}>
									Create
								</Button>
							</td>
							<td class="job-billing__cell--muted">—</td>
							<td>
								<Badge variant={CREATE_ROW_BADGE[createRowState]}>
									{CREATE_ROW_LABEL[createRowState]}
								</Badge>
							</td>
							<td class="job-billing__cell--desc">For Services Rendered</td>
							<td class="job-billing__cell--num">{formatCurrency(createRowTotal)}</td>
							<td class="job-billing__cell--num">{formatCurrency(createRowTotal)}</td>
						</tr>
					{/if}
				</tbody>
			</table>

			{#if job.invoices.length === 0 && !showCreateRow}
				<div class="job-billing__empty">
					{billableLoading
						? 'Checking for billable visits…'
						: 'No invoices yet. Visits appear here to invoice as they come due.'}
				</div>
			{/if}
		{:else}
			{#if frequency === 'on_completion'}
				<div class="job-billing__reminder">
					<i class="ri-notification-3-line" aria-hidden="true"></i>
					<span>You'll be reminded to invoice when this job is closed.</span>
				</div>
			{:else}
				<div class="job-billing__reminder">
					<i class="ri-information-line" aria-hidden="true"></i>
					<span>No automatic invoicing. Create an invoice with the actions above the job.</span>
				</div>
			{/if}
		{/if}
	</Tabs.Content>
	<Tabs.Content value="reminders" class="job-billing__panel">
		<!-- Reminders tab (Jobber ref/billing/5,8). A reminder is a contractor to-do to
		     invoice this job — not customer dunning. -->
		{#if remindersLoading && !remindersLoaded}
			<div class="job-billing__empty">Loading reminders…</div>
		{:else if reminders.length === 0}
			<div class="job-billing__empty">
				No invoice reminders yet. Add one to be prompted to invoice this job.
			</div>
		{:else}
			<table class="job-billing__table">
				<colgroup>
					<col style="width:180px">
					<col>
					<col style="width:120px">
					<col style="width:140px">
					<col style="width:96px">
				</colgroup>
				<thead>
					<tr>
						<th scope="col">Scheduled</th>
						<th scope="col">Description</th>
						<th scope="col">Status</th>
						<th scope="col">Assigned</th>
						<th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each reminders as r (r.id)}
						{@const st = reminderDisplayStatus(r)}
						<tr class:job-billing__row--done={r.status === 'completed'}>
							<td class="job-billing__cell--muted">{reminderWhen(r)}</td>
							<td>
								<button
									type="button"
									class="job-billing__rem-desc"
									onclick={(e) => openReminderDetail(r, e.currentTarget)}
								>
									{r.description || 'Invoice reminder'}
								</button>
							</td>
							<td>
								<Badge variant={REMINDER_BADGE[st]}>
									{REMINDER_DISPLAY_LABEL[st]}
								</Badge>
							</td>
							<td class="job-billing__cell--muted">{reminderCrew(r)}</td>
							<td>
								{#if canInvoice}
									<div class="job-billing__rem-actions">
										<button
											type="button"
											class="job-billing__pencil"
											onclick={() => toggleComplete(r)}
											disabled={busyReminderId === r.id}
											aria-label={r.status === 'completed' ? 'Reopen reminder' : 'Mark reminder done'}
										>
											<i
												class={r.status === 'completed' ? 'ri-arrow-go-back-line' : 'ri-check-line'}
												aria-hidden="true"
											></i>
										</button>
										<button
											type="button"
											class="job-billing__pencil"
											onclick={() => deleteReminder(r)}
											disabled={busyReminderId === r.id}
											aria-label="Delete reminder"
										>
											<i class="ri-delete-bin-line" aria-hidden="true"></i>
										</button>
									</div>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		{#if canInvoice}
			<button type="button" class="job-billing__add" onclick={addReminder}>
				<i class="ri-add-line" aria-hidden="true"></i>
				Add Reminder
			</button>
		{/if}

		<!-- Pager (Jobber ref/billing/16-17) — only when the list spans more than one page. -->
		{#if reminderTotal > REMINDER_PAGE_SIZE}
			<div class="job-billing__rem-pager">
				<span class="job-billing__rem-pager-count">
					Showing {reminderRangeStart}–{reminderRangeEnd} of {reminderTotal} items
				</span>
				<div class="job-billing__rem-pager-nav">
					<button
						type="button"
						class="job-billing__rem-pager-btn"
						onclick={() => goToReminderPage(reminderPage - 1)}
						disabled={reminderPage <= 1 || remindersLoading}
						aria-label="Previous page"
					>
						<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
					</button>
					<button
						type="button"
						class="job-billing__rem-pager-btn"
						onclick={() => goToReminderPage(reminderPage + 1)}
						disabled={reminderPage >= reminderPageCount || remindersLoading}
						aria-label="Next page"
					>
						<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
					</button>
				</div>
			</div>
		{/if}
	</Tabs.Content>
</Tabs.Root>
</section>

<InvoiceReminderFormDialog
	bind:open={reminderDialogOpen}
	mode={reminderDialogMode}
	jobId={job.id}
	jobTitle={job.title}
	clientName={job.contact_name}
	reminder={editingReminder}
	onSaved={() => loadReminders()}
/>

<SelectVisitsToInvoiceDialog bind:open={selectVisitsOpen} jobId={job.id} {onInvoiced} />

{#if detailReminder}
	<InvoiceReminderDetailPopover
		reminder={detailReminder}
		anchorEl={detailAnchor}
		jobId={job.id}
		jobTitle={job.title}
		contactId={job.contact_id}
		contactName={job.contact_name}
		contactPhone={job.contact_phone}
		contactEmail={job.contact_email}
		{canInvoice}
		busy={busyReminderId === detailReminder.id}
		onCreateInvoice={createInvoiceFromReminder}
		onEdit={() => {
			const r = detailReminder;
			closeReminderDetail();
			if (r) editReminder(r);
		}}
		onToggleComplete={() => detailReminder && toggleComplete(detailReminder)}
		onDelete={() => detailReminder && deleteReminder(detailReminder)}
		onClose={closeReminderDetail}
	/>
{/if}
