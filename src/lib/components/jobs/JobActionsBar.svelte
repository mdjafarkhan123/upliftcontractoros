<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Play, CheckCircle2, XCircle } from '@lucide/svelte';
	import type { JobStatus } from '$lib/types/jobs';

	let {
		status,
		canEdit,
		canCancel,
		loading,
		onStart,
		onComplete,
		onCancel
	}: {
		status: JobStatus;
		canEdit: boolean;
		canCancel: boolean;
		loading: boolean;
		onStart: () => void;
		onComplete: () => void;
		onCancel: () => void;
	} = $props();

	const showStart = $derived(canEdit && status === 'scheduled');
	const showComplete = $derived(canEdit && (status === 'scheduled' || status === 'in_progress'));
	const showCancel = $derived(canCancel && (status === 'scheduled' || status === 'in_progress'));

	const anyAction = $derived(showStart || showComplete || showCancel);
</script>

{#if anyAction}
	<section class="rounded-xl border border-border bg-card p-4">
		<h2 class="text-sm font-semibold text-foreground">Actions</h2>
		<div class="mt-3 grid gap-2">
			{#if showStart}
				<Button class="w-full" disabled={loading} onclick={onStart}>
					<Play class="h-4 w-4" /> Start job
				</Button>
			{/if}
			{#if showComplete}
				<Button
					variant="outline"
					class="w-full border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
					disabled={loading}
					onclick={onComplete}
				>
					<CheckCircle2 class="h-4 w-4" /> Mark complete
				</Button>
			{/if}
			{#if showCancel}
				<Button
					variant="outline"
					class="w-full border-rose-500/40 text-rose-700 hover:bg-rose-500/10"
					disabled={loading}
					onclick={onCancel}
				>
					<XCircle class="h-4 w-4" /> Cancel job
				</Button>
			{/if}
		</div>
	</section>
{/if}
