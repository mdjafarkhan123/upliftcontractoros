<script lang="ts">
	import AppointmentStatusBadge from './AppointmentStatusBadge.svelte';
	import { formatDateTime } from '$lib/utils/format';
	import { Calendar, MapPin, User } from '@lucide/svelte';
	import type { AppointmentListItem } from '$lib/types/appointments';

	let {
		appointment,
		highlight = false
	}: { appointment: AppointmentListItem; highlight?: boolean } = $props();
</script>

<a
	href={`/appointments/${appointment.id}`}
	class={[
		'block rounded-xl border p-4 transition-colors hover:bg-accent/40 active:bg-accent/60',
		highlight ? 'border-primary bg-primary/5' : 'border-border bg-card'
	].join(' ')}
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<p class="text-xs font-medium text-muted-foreground">{appointment.contact_name}</p>
			<div class="mt-0.5 flex items-center gap-2">
				<h3 class="truncate text-base font-semibold text-foreground">
					{appointment.title}
				</h3>
				{#if appointment.booking_source === 'booking_link'}
					<span class="inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
						Self-booked
					</span>
				{/if}
			</div>
		</div>
		<AppointmentStatusBadge status={appointment.status} />
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
		<span class="inline-flex items-center gap-1">
			<Calendar class="h-3.5 w-3.5" />
			{formatDateTime(appointment.scheduled_start)}
		</span>
		<span class="inline-flex items-center gap-1">
			<User class="h-3.5 w-3.5" />
			{#if appointment.assignee_name}
				{appointment.assignee_name}
			{:else}
				<span class="italic">Unassigned</span>
			{/if}
		</span>
		{#if appointment.location}
			<span class="inline-flex max-w-full items-center gap-1 truncate">
				<MapPin class="h-3.5 w-3.5 shrink-0" />
				<span class="truncate">{appointment.location}</span>
			</span>
		{/if}
	</div>
</a>
