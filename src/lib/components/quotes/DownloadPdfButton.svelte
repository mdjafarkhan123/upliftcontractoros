<script lang="ts">
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { Download } from '@lucide/svelte';

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

<JetEngineButton
	variant="outline"
	label="Download PDF"
	loadingLabel="Generating…"
	successLabel="Ready"
	onAction={download}
>
	{#snippet icon()}<Download class="h-4 w-4" />{/snippet}
</JetEngineButton>
