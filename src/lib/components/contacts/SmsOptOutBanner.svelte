<script lang="ts">
	import { AlertTriangle } from '@lucide/svelte';

	let {
		source,
		opted_out_at
	}: {
		source?: string | null;
		opted_out_at?: string | Date | null;
	} = $props();

	const when = $derived.by(() => {
		if (!opted_out_at) return null;
		try {
			return new Date(opted_out_at).toLocaleString();
		} catch {
			return null;
		}
	});
</script>

<div
	class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
	role="status"
>
	<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
	<div class="space-y-1">
		<p class="font-semibold">This contact has opted out of SMS.</p>
		<p class="text-amber-800">
			Outbound SMS is disabled. Re-opt-in can only happen when the contact texts
			<span class="font-medium">START</span> or <span class="font-medium">YES</span>.
			{#if source}
				<span class="block text-xs text-amber-700">Source: {source}{when ? ` · ${when}` : ''}</span>
			{:else if when}
				<span class="block text-xs text-amber-700">{when}</span>
			{/if}
		</p>
	</div>
</div>
