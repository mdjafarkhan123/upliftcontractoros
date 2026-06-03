<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Send } from '@lucide/svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { reviewRequestsStore, reputationSummaryStore } from '$lib/stores/reputation.svelte';

	let { jobId, label = 'Send review request' }: { jobId: string; label?: string } = $props();

	let loading = $state(false);

	async function send() {
		if (loading) return;
		loading = true;
		try {
			const res = await fetch(`/api/jobs/${jobId}/review-request`, { method: 'POST' });
			if (res.status === 201) {
				toast.success('Review request sent');
				await reviewRequestsStore.load(true);
				await reputationSummaryStore.load(true);
				return;
			}
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			toast.error(body.error ?? 'Failed to send review request');
		} catch {
			toast.error('Failed to send review request');
		} finally {
			loading = false;
		}
	}
</script>

<Button size="sm" class="h-9" onclick={send} disabled={loading}>
	<Send class="h-4 w-4" />
	{loading ? 'Sending…' : label}
</Button>
