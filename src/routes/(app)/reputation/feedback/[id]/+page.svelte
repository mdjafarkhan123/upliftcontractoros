<script lang="ts">
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import StarRating from '$lib/components/reputation/StarRating.svelte';
	import { CheckCircle2, ChevronLeft } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		privateFeedbackDetailStore,
		privateFeedbackStore,
		reputationSummaryStore
	} from '$lib/stores/reputation.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { goto } from '$app/navigation';

	const member = getMemberContext();
	const canView = $derived(member().can_view_negative_feedback);

	const id = $derived(page.params.id ?? '');

	$effect(() => {
		if (canView && id) void privateFeedbackDetailStore.load(id);
	});

	const detail = $derived(privateFeedbackDetailStore.get(id));
	const status = $derived(privateFeedbackDetailStore.getStatus(id));
	const errorMsg = $derived(privateFeedbackDetailStore.getError(id));

	let confirmOpen = $state(false);
	let resolving = $state(false);

	async function resolve() {
		resolving = true;
		try {
			const res = await fetch(`/api/private-feedback/${id}`, { method: 'PATCH' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Failed to mark resolved');
				return;
			}
			const body = (await res.json()) as {
				data: { resolved_at: string | null; resolved_by: string | null };
			};
			privateFeedbackDetailStore.apply(id, {
				is_resolved: true,
				resolved_at: body.data.resolved_at,
				resolved_by: body.data.resolved_by,
				resolved_by_name: member().full_name
			});
			privateFeedbackStore.update({ id, is_resolved: true, resolved_at: body.data.resolved_at });
			void reputationSummaryStore.load(true);
			toast.success('Feedback marked resolved');
		} catch {
			toast.error('Failed to mark resolved');
		} finally {
			resolving = false;
		}
	}

	const dateLabel = $derived(detail ? new Date(detail.created_at).toLocaleString() : '');
	const resolvedLabel = $derived(
		detail?.resolved_at ? new Date(detail.resolved_at).toLocaleString() : ''
	);
</script>

<svelte:head><title>Negative feedback</title></svelte:head>

<PageWrapper>
	<div class="mb-4">
		<Button variant="ghost" size="sm" class="-ml-2 h-9" onclick={() => goto('/reputation')}>
			<ChevronLeft class="h-4 w-4" /> Back
		</Button>
	</div>

	{#if !canView}
		<p class="text-sm text-muted-foreground">You don't have permission to view this feedback.</p>
	{:else if status === 'loading' && !detail}
		<SkeletonLoader lines={4} height="80px" label="Loading feedback" />
	{:else if errorMsg && !detail}
		<p class="text-sm text-destructive">{errorMsg}</p>
	{:else if detail}
		<article class="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h1 class="truncate text-lg font-semibold text-foreground">{detail.contact_name}</h1>
					{#if detail.job_title}
						<p class="truncate text-sm text-muted-foreground">{detail.job_title}</p>
					{/if}
				</div>
				<div class="flex flex-col items-end gap-2">
					<StarRating score={detail.score} size="lg" />
					{#if detail.is_resolved}
						<Badge variant="success">Resolved</Badge>
					{:else}
						<Badge variant="danger">Open</Badge>
					{/if}
				</div>
			</div>

			{#if detail.body}
				<p class="whitespace-pre-wrap text-sm text-foreground/90">{detail.body}</p>
			{:else}
				<p class="text-sm italic text-muted-foreground">No written feedback provided.</p>
			{/if}

			<dl class="grid gap-2 text-sm sm:grid-cols-2">
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Received</dt>
					<dd class="text-foreground">{dateLabel}</dd>
				</div>
				{#if detail.is_resolved}
					<div>
						<dt class="text-xs uppercase tracking-wide text-muted-foreground">Resolved</dt>
						<dd class="text-foreground">
							{resolvedLabel}{detail.resolved_by_name ? ` · ${detail.resolved_by_name}` : ''}
						</dd>
					</div>
				{/if}
			</dl>

			{#if !detail.is_resolved}
				<Button
					class="w-full sm:w-auto"
					onclick={() => (confirmOpen = true)}
				>
					<CheckCircle2 class="h-4 w-4" /> Mark resolved
				</Button>
			{/if}
		</article>

		<ConfirmDialog
			bind:open={confirmOpen}
			title="Mark feedback resolved?"
			description="This indicates you've followed up with the customer."
			confirmLabel="Mark resolved"
			loading={resolving}
			onConfirm={resolve}
		/>
	{/if}
</PageWrapper>
