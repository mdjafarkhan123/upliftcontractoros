<script lang="ts">
	import AppointmentStatusBadge from './AppointmentStatusBadge.svelte';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import type { AppointmentListItem, AppointmentType } from '$lib/types/appointments';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';

	let {
		appointment,
		highlight = false
	}: { appointment: AppointmentListItem; highlight?: boolean } = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);

	const TYPE_LABELS: Record<AppointmentType, string> = {
		estimate: 'Estimate',
		job_start: 'Job Visit',
		follow_up: 'Follow-up',
		inspection: 'Inspection',
		other: 'Appointment'
	};

	const typeLabel = $derived(TYPE_LABELS[appointment.type] ?? 'Appointment');

	const startTime = $derived(formatTimeInOrgTz(appointment.scheduled_start, orgTz));
	const endTime = $derived(
		appointment.scheduled_end ? formatTimeInOrgTz(appointment.scheduled_end, orgTz) : null
	);

	const avatarInitials = $derived.by(() => {
		const name = appointment.assignee_name;
		if (!name) return '?';
		const parts = name.trim().split(/\s+/);
		return parts.length >= 2
			? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
			: parts[0][0].toUpperCase();
	});

	// Crew stack — list data carries only the lead name + a total count, so we
	// render the lead avatar and an overlapping "+N" chip for the rest of the crew.
	const extraCrew = $derived(Math.max(0, appointment.assignee_count - 1));

	// Quick actions use only data already on the list item. Directions opens the
	// universal Google Maps link (works on desktop + iOS/Android).
	const directionsUrl = $derived(
		appointment.location
			? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(appointment.location)}`
			: null
	);
	const hasActions = $derived(Boolean(appointment.contact_phone) || Boolean(directionsUrl));
</script>

<article
	class={['appt-card', `appt-card--type-${appointment.type}`, highlight && 'appt-card--highlight']
		.filter(Boolean)
		.join(' ')}
>
	<a
		href={`/appointments/${appointment.id}`}
		use:prefetchOnIntent={() => appointmentsStore.prefetchDetail(appointment.id)}
		class="appt-card__link"
		aria-label={`${appointment.title} — ${appointment.contact_name}, ${appointment.all_day ? 'Anytime' : startTime}`}
	></a>

	<div class="appt-card__header">
		<span class="appt-card__badge">
			{appointment.contact_name} · {typeLabel}
		</span>
		<AppointmentStatusBadge status={appointment.status} />
	</div>

	<h3 class="appt-card__title">{appointment.title}</h3>

	<div class="appt-card__details">
		{#if appointment.location}
			<div class="appt-card__detail">
				<i class="ri-map-pin-2-line" aria-hidden="true"></i>
				<span class="appt-card__detail-text">{appointment.location}</span>
			</div>
		{/if}
		<div class="appt-card__time">
			{#if appointment.all_day}
				<i class="ri-calendar-event-line" aria-hidden="true"></i>
				<span class="appt-card__time-start">Anytime</span>
			{:else}
				<i class="ri-time-line" aria-hidden="true"></i>
				<span class="appt-card__time-start">{startTime}</span>
				{#if endTime}
					<i class="ri-arrow-right-line appt-card__time-arrow" aria-hidden="true"></i>
					<span class="appt-card__time-end">{endTime}</span>
				{/if}
			{/if}
		</div>
	</div>

	<div class="appt-card__footer">
		<div class="appt-card__assignee">
			<span class="appt-card__crew" aria-hidden="true">
				<span class="appt-card__avatar">{avatarInitials}</span>
				{#if extraCrew > 0}
					<span class="appt-card__avatar appt-card__avatar--more">+{extraCrew}</span>
				{/if}
			</span>
			{#if appointment.assignee_name}
				<span class="appt-card__assignee-name">{appointment.assignee_name}</span>
			{:else}
				<span class="appt-card__assignee-name appt-card__assignee-name--unassigned">Unassigned</span
				>
			{/if}
			{#if appointment.booking_source === 'booking_link'}
				<span class="appt-card__self-booked">Self-booked</span>
			{/if}
		</div>

		{#if hasActions}
			<div class="appt-card__actions">
				{#if appointment.contact_phone}
					<a
						class="appt-card__action"
						href={`tel:${appointment.contact_phone}`}
						aria-label={`Call ${appointment.contact_name}`}
						title="Call"
					>
						<i class="ri-phone-line" aria-hidden="true"></i>
					</a>
					<a
						class="appt-card__action"
						href={`sms:${appointment.contact_phone}`}
						aria-label={`Text ${appointment.contact_name}`}
						title="Text"
					>
						<i class="ri-message-2-line" aria-hidden="true"></i>
					</a>
				{/if}
				{#if directionsUrl}
					<a
						class="appt-card__action"
						href={directionsUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Get directions"
						title="Directions"
					>
						<i class="ri-navigation-line" aria-hidden="true"></i>
					</a>
				{/if}
			</div>
		{/if}
	</div>
</article>
