<script lang="ts">
	import type { InvoiceStatus } from '$lib/types/invoices';

	let { status, class: className }: { status: InvoiceStatus; class?: string } = $props();

	const modifiers: Record<InvoiceStatus, string> = {
		draft: 'invoice-badge--draft',
		sent: 'invoice-badge--sent',
		partially_paid: 'invoice-badge--partially_paid',
		paid: 'invoice-badge--paid',
		overdue: 'invoice-badge--overdue',
		cancelled: 'invoice-badge--cancelled'
	};

	const labels: Record<InvoiceStatus, string> = {
		draft: 'Draft',
		sent: 'Sent',
		partially_paid: 'Partial',
		paid: 'Paid',
		overdue: 'Overdue',
		cancelled: 'Cancelled'
	};
</script>

<span class="invoice-badge {modifiers[status]} {className ?? ''}">
	{labels[status]}
</span>
