<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import type { InvoiceStatus } from '$lib/types/invoices';

	let { status, class: className }: { status: InvoiceStatus; class?: string } = $props();

	const styles: Record<InvoiceStatus, string> = {
		draft: 'bg-muted text-muted-foreground',
		sent: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
		partially_paid: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
		paid: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
		overdue: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
		cancelled: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400'
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

<span
	class={cn(
		'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
		styles[status],
		className
	)}
>
	{labels[status]}
</span>
