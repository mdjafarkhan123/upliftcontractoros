<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import ActiveAutomations from '$lib/components/automation/ActiveAutomations.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatCurrency } from '$lib/utils/format';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import type { ContactSummary, ThreadContext } from '$lib/stores/inbox.svelte';

	let {
		contact,
		context
	}: {
		contact: ContactSummary | null;
		context: ThreadContext | null;
	} = $props();

	const member = getMemberContext();
	const canCreateAppt = $derived(member().can_create_appointments);
	const canCreateQuote = $derived(member().can_create_quotes);
	const canCreateInvoice = $derived(member().can_create_invoices);
	const showQuickActions = $derived(
		Boolean(contact) && (canCreateAppt || canCreateQuote || canCreateInvoice)
	);

	const appointmentHref = $derived(
		contact
			? `/appointments/new?contact_id=${encodeURIComponent(contact.id)}&contact_name=${encodeURIComponent(contact.full_name)}`
			: '/appointments/new'
	);
	const quoteHref = $derived(
		contact ? `/quotes/new?contact_id=${encodeURIComponent(contact.id)}` : '/quotes/new'
	);
	const invoiceHref = $derived(
		contact ? `/invoices/new?contact_id=${encodeURIComponent(contact.id)}` : '/invoices/new'
	);

	const quoteVariant = $derived.by(() => {
		const s = context?.latest_quote?.status;
		if (!s) return 'default';
		if (s === 'accepted') return 'success';
		if (s === 'declined' || s === 'expired') return 'danger';
		if (s === 'sent' || s === 'viewed') return 'info';
		return 'default';
	});

	const invoiceVariant = $derived.by(() => {
		const s = context?.latest_invoice?.status;
		if (!s) return 'default';
		if (s === 'paid') return 'success';
		if (s === 'past_due') return 'danger';
		if (s === 'sent_not_due' || s === 'awaiting_payment') return 'info';
		return 'default';
	});

	const LEAD_SOURCE_LABELS: Record<string, string> = {
		manual: 'Manual',
		missed_call: 'Missed Call',
		website_form: 'Website Form',
		webchat: 'Web Chat',
		booking_link: 'Booking Link',
		referral: 'Referral',
		import: 'Import',
		google_business: 'Google Business',
		facebook: 'Facebook',
		other: 'Other'
	};
	const leadSourceLabel = $derived(
		contact?.lead_source ? (LEAD_SOURCE_LABELS[contact.lead_source] ?? contact.lead_source) : null
	);

	function fmtDateTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="contact-ctx">
	{#if showQuickActions}
		<section class="contact-ctx__section">
			<div class="contact-ctx__heading">
				<i class="ri-add-line" aria-hidden="true"></i>
				Quick actions
			</div>
			<div class="contact-ctx__quick">
				{#if canCreateAppt}
					<a
						href={appointmentHref}
						class="contact-ctx__quick-btn"
						aria-label={`Schedule appointment with ${contact?.full_name ?? 'contact'}`}
					>
						<i class="ri-calendar-event-line" aria-hidden="true"></i>
						<span>Schedule</span>
					</a>
				{/if}
				{#if canCreateQuote}
					<a
						href={quoteHref}
						class="contact-ctx__quick-btn"
						aria-label={`Create quote for ${contact?.full_name ?? 'contact'}`}
					>
						<i class="ri-file-text-line" aria-hidden="true"></i>
						<span>Quote</span>
					</a>
				{/if}
				{#if canCreateInvoice}
					<a
						href={invoiceHref}
						class="contact-ctx__quick-btn"
						aria-label={`Create invoice for ${contact?.full_name ?? 'contact'}`}
					>
						<i class="ri-bill-line" aria-hidden="true"></i>
						<span>Invoice</span>
					</a>
				{/if}
			</div>
		</section>
	{/if}

	{#if contact}
		<section class="contact-ctx__section">
			<div class="contact-ctx__heading">
				<i class="ri-user-line" aria-hidden="true"></i>
				Contact
			</div>
			<div class="contact-ctx__card">
				<a href={`/contacts/${contact.id}`} class="contact-ctx__name">
					{contact.full_name}
				</a>
				<div class="contact-ctx__row">
					<i class="ri-phone-line" aria-hidden="true"></i>
					{formatPhoneDisplay(contact.phone)}
				</div>
				{#if contact.email}
					<div class="contact-ctx__email">{contact.email}</div>
				{/if}
			</div>
		</section>
	{/if}

	{#if contact}
		<ActiveAutomations contactId={contact.id} />
	{/if}

	{#if leadSourceLabel}
		<section class="contact-ctx__section">
			<div class="contact-ctx__heading">
				<i class="ri-sparkling-line" aria-hidden="true"></i>
				Lead Source
			</div>
			<div class="contact-ctx__card">
				<Badge label={leadSourceLabel} variant="info" />
			</div>
		</section>
	{/if}

	<section class="contact-ctx__section">
		<div class="contact-ctx__heading">
			<i class="ri-calendar-schedule-line" aria-hidden="true"></i>
			Next Appointment
		</div>
		<div class="contact-ctx__card">
			{#if context?.next_appointment}
				<a
					href={`/appointments/${context.next_appointment.id}`}
					use:prefetchOnIntent={() =>
						appointmentsStore.prefetchDetail(context!.next_appointment!.id)}
					class="contact-ctx__link"
				>
					<div class="contact-ctx__appt-time">
						{fmtDateTime(context.next_appointment.scheduled_start)}
					</div>
					<div class="contact-ctx__appt-sub">
						{context.next_appointment.title ?? context.next_appointment.type}
					</div>
				</a>
			{:else}
				<span class="contact-ctx__muted">No upcoming appointments</span>
			{/if}
		</div>
	</section>

	<section class="contact-ctx__section">
		<div class="contact-ctx__heading">
			<i class="ri-git-branch-line" aria-hidden="true"></i>
			Pipeline
		</div>
		<div class="contact-ctx__card">
			{#if context?.pipeline_stage}
				<Badge label={context.pipeline_stage} variant="info" />
			{:else}
				<span class="contact-ctx__muted">Not in pipeline</span>
			{/if}
		</div>
	</section>

	<section class="contact-ctx__section">
		<div class="contact-ctx__heading">
			<i class="ri-file-text-line" aria-hidden="true"></i>
			Latest quote
		</div>
		<div class="contact-ctx__card">
			{#if context?.latest_quote}
				<a
					href={`/quotes/${context.latest_quote.id}`}
					use:prefetchOnIntent={() => quotesStore.prefetchDetail(context!.latest_quote!.id)}
					class="contact-ctx__link contact-ctx__doc"
				>
					<span class="contact-ctx__doc-num">
						Q-{String(context.latest_quote.quote_number).padStart(4, '0')}
					</span>
					<Badge label={context.latest_quote.status} variant={quoteVariant} />
				</a>
				<div class="contact-ctx__doc-total">
					{formatCurrency(context.latest_quote.total)}
				</div>
			{:else}
				<span class="contact-ctx__muted">No quotes yet</span>
			{/if}
		</div>
	</section>

	<section class="contact-ctx__section">
		<div class="contact-ctx__heading">
			<i class="ri-bill-line" aria-hidden="true"></i>
			Latest invoice
		</div>
		<div class="contact-ctx__card">
			{#if context?.latest_invoice}
				<a
					href={`/invoices/${context.latest_invoice.id}`}
					use:prefetchOnIntent={() => invoicesStore.prefetchDetail(context!.latest_invoice!.id)}
					class="contact-ctx__link contact-ctx__doc"
				>
					<span class="contact-ctx__doc-num">
						INV-{String(context.latest_invoice.invoice_number).padStart(4, '0')}
					</span>
					<Badge label={context.latest_invoice.status} variant={invoiceVariant} />
				</a>
				<div class="contact-ctx__doc-total">
					{formatCurrency(context.latest_invoice.total)}
				</div>
			{:else}
				<span class="contact-ctx__muted">No invoices yet</span>
			{/if}
		</div>
	</section>
</div>
