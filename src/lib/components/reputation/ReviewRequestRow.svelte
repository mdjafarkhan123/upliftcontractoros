<script lang="ts">
	import type { ReviewRequestListItem } from '$lib/types/reputation';
	import { Badge } from '$lib/components/ui/badge';
	import StarRating from './StarRating.svelte';

	let { request }: { request: ReviewRequestListItem } = $props();

	const statusLabel = $derived(
		request.status === 'sent'
			? 'Sent · waiting'
			: request.status === 'responded'
				? 'Responded'
				: request.status === 'failed'
					? 'Failed'
					: request.status === 'no_response'
						? 'No response'
						: 'Pending'
	);
	const statusVariant = $derived<'success' | 'danger' | 'default'>(
		request.status === 'responded'
			? 'success'
			: request.status === 'failed'
				? 'danger'
				: 'default'
	);

	const dateLabel = $derived(
		(request.responded_at ?? request.sent_at ?? request.created_at)
			? new Date(request.responded_at ?? request.sent_at ?? request.created_at).toLocaleDateString()
			: ''
	);
</script>

<article class="rounded-xl border border-border bg-card p-4 shadow-sm">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-foreground">{request.job_title ?? 'Untitled job'}</p>
			<p class="truncate text-xs text-muted-foreground">{request.contact_name}</p>
		</div>
		<Badge variant={statusVariant}>{statusLabel}</Badge>
	</div>

	{#if request.response_score !== null}
		<div class="mt-3"><StarRating score={request.response_score} size="md" /></div>
	{/if}

	<p class="mt-3 text-xs text-muted-foreground">
		{request.sent_by_automation ? 'Automated' : 'Manual'} · {dateLabel}
	</p>
</article>
