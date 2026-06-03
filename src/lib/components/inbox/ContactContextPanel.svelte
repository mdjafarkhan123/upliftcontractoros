<script lang="ts">
	import {
		User2,
		GitBranch,
		FileText,
		Receipt,
		Phone,
		Sparkles,
		CalendarClock
	} from '@lucide/svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatCurrency } from '$lib/utils/format';
	import type { ContactSummary, ThreadContext } from '$lib/stores/inbox.svelte';

	let {
		contact,
		context
	}: {
		contact: ContactSummary | null;
		context: ThreadContext | null;
	} = $props();

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
		if (s === 'overdue') return 'danger';
		if (s === 'sent' || s === 'partial') return 'info';
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

<div class="space-y-4">
	{#if contact}
		<section class="space-y-2">
			<div
				class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
			>
				<User2 class="h-3.5 w-3.5" />
				Contact
			</div>
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<a
					href={`/contacts/${contact.id}`}
					class="block truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
				>
					{contact.full_name}
				</a>
				<div class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
					<Phone class="h-3 w-3" />
					{formatPhoneDisplay(contact.phone)}
				</div>
				{#if contact.email}
					<div class="mt-1 truncate text-xs text-muted-foreground">{contact.email}</div>
				{/if}
			</div>
		</section>
	{/if}

	{#if leadSourceLabel}
		<section class="space-y-2">
			<div
				class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
			>
				<Sparkles class="h-3.5 w-3.5" />
				Lead Source
			</div>
			<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
				<Badge label={leadSourceLabel} variant="info" />
			</div>
		</section>
	{/if}

	<section class="space-y-2">
		<div
			class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			<CalendarClock class="h-3.5 w-3.5" />
			Next Appointment
		</div>
		<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
			{#if context?.next_appointment}
				<a
					href={`/appointments/${context.next_appointment.id}`}
					class="block transition-colors hover:text-primary"
				>
					<div class="text-sm font-medium text-foreground">
						{fmtDateTime(context.next_appointment.scheduled_start)}
					</div>
					<div class="mt-1 text-xs text-muted-foreground">
						{context.next_appointment.title ?? context.next_appointment.type}
					</div>
				</a>
			{:else}
				<span class="text-xs text-muted-foreground">No upcoming appointments</span>
			{/if}
		</div>
	</section>

	<section class="space-y-2">
		<div
			class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			<GitBranch class="h-3.5 w-3.5" />
			Pipeline
		</div>
		<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
			{#if context?.pipeline_stage}
				<Badge label={context.pipeline_stage} variant="info" />
			{:else}
				<span class="text-xs text-muted-foreground">Not in pipeline</span>
			{/if}
		</div>
	</section>

	<section class="space-y-2">
		<div
			class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			<FileText class="h-3.5 w-3.5" />
			Latest quote
		</div>
		<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
			{#if context?.latest_quote}
				<a
					href={`/quotes/${context.latest_quote.id}`}
					class="flex items-center justify-between gap-2 transition-colors hover:text-primary"
				>
					<span class="text-sm font-medium text-foreground">
						Q-{String(context.latest_quote.quote_number).padStart(4, '0')}
					</span>
					<Badge label={context.latest_quote.status} variant={quoteVariant} />
				</a>
				<div class="mt-1 text-xs text-muted-foreground">
					{formatCurrency(context.latest_quote.total)}
				</div>
			{:else}
				<span class="text-xs text-muted-foreground">No quotes yet</span>
			{/if}
		</div>
	</section>

	<section class="space-y-2">
		<div
			class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			<Receipt class="h-3.5 w-3.5" />
			Latest invoice
		</div>
		<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
			{#if context?.latest_invoice}
				<a
					href={`/invoices/${context.latest_invoice.id}`}
					class="flex items-center justify-between gap-2 transition-colors hover:text-primary"
				>
					<span class="text-sm font-medium text-foreground">
						INV-{String(context.latest_invoice.invoice_number).padStart(4, '0')}
					</span>
					<Badge label={context.latest_invoice.status} variant={invoiceVariant} />
				</a>
				<div class="mt-1 text-xs text-muted-foreground">
					{formatCurrency(context.latest_invoice.total)}
				</div>
			{:else}
				<span class="text-xs text-muted-foreground">No invoices yet</span>
			{/if}
		</div>
	</section>
</div>
