<script lang="ts">
	import type { InvoiceStatus } from '$lib/types/invoices';

	let { status, class: className }: { status: InvoiceStatus; class?: string } = $props();

	// Strict Jobber labels (see jobber-05 §2). sent_not_due reads "Sent" (sent, not yet due);
	// awaiting_payment reads "Awaiting Payment" (due now, unpaid); past_due reads "Past Due".
	const labels: Record<InvoiceStatus, string> = {
		draft: 'Draft',
		sent_not_due: 'Sent',
		awaiting_payment: 'Awaiting Payment',
		paid: 'Paid',
		past_due: 'Past Due',
		bad_debt: 'Bad Debt'
	};
</script>

<span class="invoice-badge invoice-badge--{status} {className ?? ''}">
	{labels[status]}
</span>
