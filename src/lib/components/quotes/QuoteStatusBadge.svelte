<script lang="ts">
	import type { QuoteStatus } from '$lib/types/quotes';

	let {
		status,
		version,
		class: className
	}: { status: QuoteStatus; version?: number; class?: string } = $props();

	const modifiers: Record<QuoteStatus, string> = {
		draft: 'quote-badge--draft',
		sent: 'quote-badge--sent',
		viewed: 'quote-badge--viewed',
		accepted: 'quote-badge--accepted',
		declined: 'quote-badge--declined',
		expired: 'quote-badge--expired',
		changes_requested: 'quote-badge--changes'
	};

	const labels: Record<QuoteStatus, string> = {
		draft: 'Draft',
		sent: 'Sent',
		viewed: 'Viewed',
		accepted: 'Accepted',
		declined: 'Declined',
		expired: 'Expired',
		changes_requested: 'Changes requested'
	};

	const showVersion = $derived(
		version != null &&
			version > 1 &&
			(status === 'sent' || status === 'viewed' || status === 'changes_requested')
	);
</script>

<span class="quote-badge {modifiers[status]} {className ?? ''}">
	{#if status === 'viewed'}
		<i class="ri-eye-line" aria-hidden="true"></i>
	{/if}
	{labels[status]}{#if showVersion}&nbsp;(v{version}){/if}
</span>
