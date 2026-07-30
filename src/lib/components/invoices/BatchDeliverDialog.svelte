<script lang="ts">
	import NotifyDialog from '$lib/components/shared/NotifyDialog.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';

	// Batch Deliver dialog (Jobber batch billing, part 2). A thin wrapper over the shared
	// NotifyDialog — the SAME channel picker + editable tokenized message used for single
	// quote/invoice sends — put into its multi-recipient mode. The contractor picks Email /
	// Text / Both once and (optionally) edits the message; it applies to every selected draft,
	// each delivered to its own client (merge tokens fill per-client in the worker).

	type Edited = { sms: string | null; subject: string | null; body: string | null };
	type ConfirmResult = { ok: boolean; channelError?: string };

	let {
		open = $bindable(false),
		count,
		onConfirm
	}: {
		open?: boolean;
		count: number;
		// Performs the batch send; returns ok to close the dialog. The page owns the fetch so it
		// can patch its list + stats from the per-invoice result.
		onConfirm: (
			channels: ('email' | 'sms')[],
			edited: Edited | null
		) => Promise<ConfirmResult | boolean>;
	} = $props();

	const orgName = $derived(sessionStore.data?.org.name ?? 'Your business');

	const mergeFields = [
		{ token: 'contact_name', label: 'Contact name' },
		{ token: 'org_name', label: 'Business name' },
		{ token: 'invoice_number', label: 'Invoice #' },
		{ token: 'invoice_amount', label: 'Invoice total' },
		{ token: 'invoice_link', label: 'Invoice link' }
	];

	// Same default copy the single-invoice send uses (kept in sync with SendDocumentDialog). When
	// the contractor leaves a field untouched we send null so the worker's built-in copy stays the
	// single source of truth.
	const defaultSms = $derived(
		`Hi {contact_name}, {org_name} sent you an invoice ({invoice_number}, {invoice_amount}). View & pay: {invoice_link}`
	);
	const defaultSubject = $derived(`Your invoice {invoice_number} from {org_name}`);
	const defaultBody = $derived(
		`Hi {contact_name},\n\n{org_name} has sent you an invoice ({invoice_number}, {invoice_amount}).\n\nView & pay your invoice:\n{invoice_link}`
	);

	// Batch preview: fill the business name (constant across the batch) and leave the per-client
	// tokens as literal {tokens}, so the contractor sees exactly what varies per invoice.
	function fill(template: string): string {
		return template.replaceAll('{org_name}', orgName);
	}

	const subtitle = $derived(`${count} draft invoice${count === 1 ? '' : 's'}`);
	const recipientName = $derived(`${count} client${count === 1 ? '' : 's'}`);
</script>

<NotifyDialog
	bind:open
	title="Send invoices"
	{subtitle}
	{recipientName}
	recipientSummary="Each client gets their own invoice — details fill in per client. Clients unreachable on the chosen channel are skipped."
	editable
	{mergeFields}
	fill={(t) => fill(t)}
	{defaultSms}
	{defaultSubject}
	{defaultBody}
	confirmLabel="Send now"
	confirmSuccessLabel="Sent"
	{onConfirm}
/>
