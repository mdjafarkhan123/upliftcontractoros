<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	type Confirmation = {
		orgName: string;
		bookingTitle: string;
		scheduledStart: string;
		timezone: string;
	};

	let confirmation = $state<Confirmation | null>(null);

	onMount(() => {
		const id = page.url.searchParams.get('a');
		if (!id) return;
		try {
			const raw = sessionStorage.getItem(`book:confirm:${id}`);
			if (raw) confirmation = JSON.parse(raw) as Confirmation;
		} catch {
			// Ignored — generic confirmation copy will render.
		}
	});

	const dateLabel = $derived(
		confirmation
			? new Intl.DateTimeFormat('en-US', {
					weekday: 'long',
					month: 'long',
					day: 'numeric',
					year: 'numeric',
					timeZone: confirmation.timezone
				}).format(new Date(confirmation.scheduledStart))
			: ''
	);
	const timeLabel = $derived(
		confirmation
			? new Intl.DateTimeFormat('en-US', {
					hour: 'numeric',
					minute: '2-digit',
					timeZone: confirmation.timezone
				}).format(new Date(confirmation.scheduledStart))
			: ''
	);
</script>

<svelte:head>
	<title>Booking confirmed</title>
</svelte:head>

<div class="book-success">
	<div class="book-success__icon">
		<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
	</div>

	<h1 class="book-success__title">You're booked</h1>
	<p class="book-success__lead">
		{#if confirmation}
			Your appointment is confirmed.<br />
			<span>{confirmation.orgName}</span> will be in touch shortly.
		{:else}
			Your appointment is confirmed. We'll be in touch shortly.
		{/if}
	</p>

	{#if confirmation}
		<div class="book-success__card">
			<p class="book-success__eyebrow">{confirmation.bookingTitle}</p>
			<div class="book-success__rows">
				<div class="book-success__row">
					<div class="book-success__row-icon">
						<i class="ri-calendar-event-line" aria-hidden="true"></i>
					</div>
					<span class="book-success__row-text">{dateLabel}</span>
				</div>
				<div class="book-success__row">
					<div class="book-success__row-icon">
						<i class="ri-time-line" aria-hidden="true"></i>
					</div>
					<span class="book-success__row-text">{timeLabel}</span>
				</div>
			</div>
		</div>

		<p class="book-success__tz">Times shown in {confirmation.timezone.replace(/_/g, ' ')}</p>
	{/if}
</div>
