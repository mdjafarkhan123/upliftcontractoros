<script lang="ts">
	import DraggablePanel from '$lib/components/shared/DraggablePanel.svelte';
	import { formatDate } from '$lib/utils/format';
	import { reminderDisplayStatus, REMINDER_DISPLAY_LABEL } from '$lib/jobs/billing';
	import type { JobInvoiceReminderRow } from '$lib/types/jobs';
	import Avatar from '$lib/components/shared/Avatar.svelte';

	// Invoice Reminder Details popup (Jobber ref/billing/18). Clicking a reminder on the
	// Billing → Reminders tab opens this free-floating detail card. Reuses the same
	// DraggablePanel shell + card-detail-pop visual language as the appointment card-detail
	// popover (Rule 23 — one shared popover look). Footer: Create Invoice (primary) + a
	// More Actions reveal (Edit / Mark complete·Reopen / Delete). All write actions are the
	// parent's — this popover only renders + emits.
	let {
		reminder,
		anchorEl,
		jobId,
		jobTitle,
		contactId,
		contactName,
		contactPhone = null,
		contactEmail = null,
		// can_create_invoices — gates every action (Create Invoice + More Actions).
		canInvoice = false,
		busy = false,
		onCreateInvoice,
		onEdit,
		onToggleComplete,
		onDelete,
		onClose
	}: {
		reminder: JobInvoiceReminderRow;
		anchorEl: HTMLElement | null;
		jobId: string;
		jobTitle: string;
		contactId: string;
		contactName: string;
		contactPhone?: string | null;
		contactEmail?: string | null;
		canInvoice?: boolean;
		busy?: boolean;
		onCreateInvoice: () => void;
		onEdit: () => void;
		onToggleComplete: () => void;
		onDelete: () => void;
		onClose: () => void;
	} = $props();

	// Info | Client tabs (Jobber ref/billing/18).
	let tab = $state<'info' | 'client'>('info');
	let showMore = $state(false);

	const status = $derived(reminderDisplayStatus(reminder));
	const done = $derived(reminder.status === 'completed');

	// When line — "no date yet" for schedule-later, "· Anytime" for all-day, else date + time.
	const whenText = $derived.by(() => {
		if (!reminder.scheduled_start) return 'No date yet';
		const date = formatDate(reminder.scheduled_start);
		if (reminder.all_day) return `${date} · Anytime`;
		const time = new Date(reminder.scheduled_start).toLocaleTimeString([], {
			hour: 'numeric',
			minute: '2-digit'
		});
		return `${date} · ${time}`;
	});

	const lead = $derived(reminder.assignees.find((a) => a.is_lead) ?? reminder.assignees[0] ?? null);
</script>

<DraggablePanel {anchorEl} ariaLabel="Invoice reminder details" {onClose} width="340px">
	<div class="card-detail-pop card-detail-pop--panel">
		<h3 class="card-detail-pop__title">Invoice reminder for {contactName} for {jobTitle}</h3>
		<!-- Keep any custom note the contractor typed as the secondary line. -->
		<p class="card-detail-pop__subtype">{reminder.description || 'Invoice reminder'}</p>

		<!-- Derived status pill (Upcoming / Today / Overdue / Completed / Unscheduled). -->
		<span class="job-billing__status job-billing__status--{status}">
			<span class="job-billing__dot job-billing__dot--{status}" aria-hidden="true"></span>
			{REMINDER_DISPLAY_LABEL[status]}
		</span>

		<!-- Info | Client tabs -->
		<div class="card-detail-pop__tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'info'}
				class="card-detail-pop__tab"
				class:card-detail-pop__tab--active={tab === 'info'}
				onclick={() => (tab = 'info')}
			>
				Info
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'client'}
				class="card-detail-pop__tab"
				class:card-detail-pop__tab--active={tab === 'client'}
				onclick={() => (tab = 'client')}
			>
				Client
			</button>
		</div>

		{#if tab === 'info'}
			<!-- Details: job link + client -->
			<div class="card-detail-pop__details">
				<span class="card-detail-pop__section-label">Details</span>
				<p class="card-detail-pop__detail-line">
					<a class="card-detail-pop__link" href={`/jobs/${jobId}`}>{jobTitle}</a>
					<span class="card-detail-pop__dot" aria-hidden="true">·</span>
					<a class="card-detail-pop__link" href={`/contacts/${contactId}`}>{contactName}</a>
				</p>
			</div>

			<!-- When -->
			<div class="card-detail-pop__when">
				<div class="card-detail-pop__when-col">
					<span class="card-detail-pop__when-label">When</span>
					<span class="card-detail-pop__when-date">{whenText}</span>
				</div>
			</div>

			<!-- Assigned -->
			<div class="card-detail-pop__team">
				<span class="card-detail-pop__team-label">Assigned to</span>
				{#if lead}
					<span class="card-detail-pop__crew">
						<Avatar size="sm" name={lead.full_name} />
						<span>{lead.full_name}</span>
						{#if reminder.assignees.length > 1}
							<span class="card-detail-pop__more">+{reminder.assignees.length - 1}</span>
						{/if}
					</span>
				{:else}
					<span class="card-detail-pop__unassigned">Unassigned</span>
				{/if}
			</div>
		{:else}
			<!-- Client tab -->
			<div class="card-detail-pop__details">
				<span class="card-detail-pop__section-label">Client</span>
				<p class="card-detail-pop__detail-line">
					<a class="card-detail-pop__link" href={`/contacts/${contactId}`}>{contactName}</a>
				</p>
				{#if contactPhone}
					<p class="card-detail-pop__instructions">
						<a class="card-detail-pop__link" href={`tel:${contactPhone}`}>{contactPhone}</a>
					</p>
				{/if}
				{#if contactEmail}
					<p class="card-detail-pop__instructions">
						<a class="card-detail-pop__link" href={`mailto:${contactEmail}`}>{contactEmail}</a>
					</p>
				{/if}
			</div>
		{/if}

		<!-- More actions revealed inline (Edit / complete / delete) — no nested portal. -->
		{#if showMore && canInvoice}
			<div class="card-detail-pop__more-row">
				<button type="button" class="card-detail-pop__more-btn" disabled={busy} onclick={onEdit}>
					<i class="ri-pencil-line" aria-hidden="true"></i>
					<span>Edit</span>
				</button>
				<button
					type="button"
					class="card-detail-pop__more-btn"
					disabled={busy}
					onclick={onToggleComplete}
				>
					{#if busy}
						<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
					{:else}
						<i class={done ? 'ri-arrow-go-back-line' : 'ri-check-line'} aria-hidden="true"></i>
					{/if}
					<span>{done ? 'Reopen' : 'Mark complete'}</span>
				</button>
				<button
					type="button"
					class="card-detail-pop__more-btn card-detail-pop__more-btn--danger"
					disabled={busy}
					onclick={onDelete}
				>
					<i class="ri-delete-bin-line" aria-hidden="true"></i>
					<span>Delete</span>
				</button>
			</div>
		{/if}

		<!-- Footer: Create Invoice + More actions -->
		<footer class="card-detail-pop__foot">
			{#if canInvoice}
				<button
					type="button"
					class="card-detail-pop__icon-btn"
					aria-label="More actions"
					aria-pressed={showMore}
					onclick={() => (showMore = !showMore)}
				>
					<i class="ri-more-2-fill" aria-hidden="true"></i>
				</button>
			{/if}
			<span class="card-detail-pop__foot-spacer"></span>
			{#if canInvoice}
				<button
					type="button"
					class="card-detail-pop__btn card-detail-pop__btn--primary"
					disabled={busy}
					onclick={onCreateInvoice}
				>
					<i class="ri-bill-line" aria-hidden="true"></i>
					<span>Create Invoice</span>
				</button>
			{/if}
		</footer>
	</div>
</DraggablePanel>
