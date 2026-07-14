<script lang="ts">
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import StarRating from '$lib/components/reputation/StarRating.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		privateFeedbackDetailStore,
		privateFeedbackStore,
		reputationSummaryStore
	} from '$lib/stores/reputation.svelte';
	import { getMemberContext } from '$lib/context/member';

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

	// Confirm dialog only opens on "Mark resolved" — lazy-load it.
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	let confirmDialogLoading = $state(false);
	$effect(() => {
		if (!confirmOpen || ConfirmDialog || confirmDialogLoading) return;
		confirmDialogLoading = true;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

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

<PageWrapper title="Negative feedback" back="/reputation">
	{#if !canView}
		<p class="feedback-detail__body--empty">You don't have permission to view this feedback.</p>
	{:else if status === 'loading' && !detail}
		<SkeletonLoader lines={4} height="80px" label="Loading feedback" />
	{:else if errorMsg && !detail}
		<p class="feedback-detail__body--empty">{errorMsg}</p>
	{:else if detail}
		<article class="feedback-detail">
			<div class="feedback-detail__head">
				<div class="feedback-detail__id">
					<h1 class="feedback-detail__name">{detail.contact_name}</h1>
					{#if detail.job_title}
						<p class="feedback-detail__sub">{detail.job_title}</p>
					{/if}
				</div>
				<div class="feedback-detail__meta">
					<StarRating score={detail.score} size="lg" />
					{#if detail.is_resolved}
						<Badge variant="success">Resolved</Badge>
					{:else}
						<Badge variant="danger">Open</Badge>
					{/if}
				</div>
			</div>

			{#if detail.body}
				<p class="feedback-detail__body">{detail.body}</p>
			{:else}
				<p class="feedback-detail__body feedback-detail__body--empty">
					No written feedback provided.
				</p>
			{/if}

			<dl class="feedback-detail__dl">
				<div>
					<dt class="feedback-detail__dt">Received</dt>
					<dd class="feedback-detail__dd">{dateLabel}</dd>
				</div>
				{#if detail.is_resolved}
					<div>
						<dt class="feedback-detail__dt">Resolved</dt>
						<dd class="feedback-detail__dd">
							{resolvedLabel}{detail.resolved_by_name ? ` · ${detail.resolved_by_name}` : ''}
						</dd>
					</div>
				{/if}
			</dl>

			{#if !detail.is_resolved}
				<Button type="button" onclick={() => (confirmOpen = true)}>
					<i class="ri-checkbox-circle-line" aria-hidden="true"></i> Mark resolved
				</Button>
			{/if}
		</article>

		{#if ConfirmDialog}
			<ConfirmDialog
				bind:open={confirmOpen}
				title="Mark feedback resolved?"
				description="This indicates you've followed up with the customer."
				confirmLabel="Mark resolved"
				loading={resolving}
				onConfirm={resolve}
			/>
		{/if}
	{/if}
</PageWrapper>
