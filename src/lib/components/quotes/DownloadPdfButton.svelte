<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';

	let { quoteId }: { quoteId: string } = $props();

	async function download() {
		const res = await fetch(`/api/quotes/${quoteId}/pdf`, { method: 'POST' });
		const body = await res.json().catch(() => null);
		if (!res.ok || !body?.data?.url) {
			toast.error(body?.error ?? 'Failed to generate PDF');
			throw new Error('pdf');
		}
		window.open(body.data.url, '_blank', 'noopener');
	}
</script>

<Button variant="outline" loadingLabel="Generating…" successLabel="Ready" onAction={download}>
	Download PDF
	{#snippet icon()}<i class="ri-download-line" aria-hidden="true"></i>{/snippet}
</Button>
