<script lang="ts">
	import { onMount } from 'svelte';
	import { Calendar } from '@lucide/svelte';
	import AppointmentCard from '$lib/components/appointments/AppointmentCard.svelte';
	import type { AppointmentListItem } from '$lib/types/appointments';

	let { jobId }: { jobId: string } = $props();

	let items = $state<AppointmentListItem[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	onMount(async () => {
		try {
			const from = new Date().toISOString();
			// One year forward — covers any realistic upcoming horizon for a single job.
			const to = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
			const params = new URLSearchParams({ from, to, job_id: jobId, status: 'scheduled' });
			const res = await fetch(`/api/appointments?${params.toString()}`);
			if (!res.ok) {
				errorMsg = 'Failed to load appointments.';
				return;
			}
			const body = (await res.json()) as { items: AppointmentListItem[] };
			items = body.items;
		} catch {
			errorMsg = 'Failed to load appointments.';
		} finally {
			loading = false;
		}
	});

	const nextId = $derived(items[0]?.id ?? null);
</script>

<section class="rounded-xl border border-border bg-card p-4">
	<div class="mb-3 flex items-center gap-2">
		<Calendar class="h-4 w-4 text-muted-foreground" />
		<h2 class="text-sm font-semibold text-foreground">Upcoming appointments</h2>
	</div>

	{#if loading}
		<p class="text-xs text-muted-foreground">Loading…</p>
	{:else if errorMsg}
		<p class="text-xs text-destructive">{errorMsg}</p>
	{:else if items.length === 0}
		<p class="text-xs text-muted-foreground">No upcoming appointments for this job.</p>
	{:else}
		<ul class="space-y-2">
			{#each items as appointment (appointment.id)}
				<li>
					<AppointmentCard {appointment} highlight={appointment.id === nextId} />
				</li>
			{/each}
		</ul>
	{/if}
</section>
