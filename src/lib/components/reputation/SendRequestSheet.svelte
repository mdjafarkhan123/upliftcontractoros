<script lang="ts">
	import BottomSheet from '$lib/components/shared/BottomSheet.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Send, Briefcase } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { reviewRequestsStore, reputationSummaryStore } from '$lib/stores/reputation.svelte';
	import type { EligibleJob } from '$lib/types/reputation';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let items = $state<EligibleJob[]>([]);
	let error = $state<string | null>(null);
	let sendingJobId = $state<string | null>(null);

	async function load() {
		status = 'loading';
		error = null;
		try {
			const res = await fetch('/api/review-requests/eligible-jobs');
			if (!res.ok) throw new Error(`Failed (${res.status})`);
			const body = (await res.json()) as { items: EligibleJob[] };
			items = body.items;
			status = 'ready';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
			status = 'error';
		}
	}

	$effect(() => {
		if (open) void load();
	});

	async function send(job: EligibleJob) {
		if (sendingJobId) return;
		sendingJobId = job.job_id;
		try {
			const res = await fetch(`/api/jobs/${job.job_id}/review-request`, { method: 'POST' });
			if (res.status === 201) {
				toast.success(`Review request sent to ${job.contact_name}`);
				items = items.filter((i) => i.job_id !== job.job_id);
				await reviewRequestsStore.load(true);
				await reputationSummaryStore.load(true);
				open = false;
				return;
			}
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			toast.error(body.error ?? 'Failed to send review request');
		} catch {
			toast.error('Failed to send review request');
		} finally {
			sendingJobId = null;
		}
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString();
	}
</script>

<BottomSheet
	bind:open
	title="Send review request"
	description="Pick a completed job to text the customer a review link."
>
	<div class="mt-4 max-h-[60vh] overflow-y-auto pb-4">
		{#if status === 'loading'}
			<SkeletonLoader lines={4} height="64px" label="Loading jobs" />
		{:else if status === 'error'}
			<EmptyState
				icon={Briefcase}
				title="Couldn't load jobs"
				description={error ?? 'Please try again.'}
			/>
		{:else if items.length === 0}
			<EmptyState
				icon={Briefcase}
				title="No eligible jobs"
				description="Every completed job already has a review request, or contacts have opted out of SMS."
			/>
		{:else}
			<ul class="grid gap-2">
				{#each items as job (job.job_id)}
					<li>
						<button
							type="button"
							class="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
							onclick={() => send(job)}
							disabled={sendingJobId !== null}
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-foreground">
									{job.job_title ?? 'Untitled job'}
								</p>
								<p class="truncate text-xs text-muted-foreground">
									{job.contact_name} · Completed {formatDate(job.completed_at)}
								</p>
							</div>
							<Send class="h-4 w-4 shrink-0 text-muted-foreground" />
							{#if sendingJobId === job.job_id}
								<span class="text-xs text-muted-foreground">Sending…</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</BottomSheet>
