<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Clock from '@lucide/svelte/icons/clock';

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

<main class="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center">
	<div
		class="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_20px_50px_-20px_hsl(var(--brand-primary)/0.6)]"
	>
		<CheckCircle2 class="h-8 w-8 text-primary" />
	</div>

	<h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
		You're booked
	</h1>
	<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
		{#if confirmation}
			Your appointment is confirmed.<br />
			<span class="text-foreground">{confirmation.orgName}</span> will be in touch shortly.
		{:else}
			Your appointment is confirmed. We'll be in touch shortly.
		{/if}
	</p>

	{#if confirmation}
		<div
			class="mt-8 w-full rounded-2xl border border-border/60 bg-card/70 p-5 text-left shadow-[0_20px_60px_-30px_hsl(0_0%_0%/0.6)] backdrop-blur"
		>
			<p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
				{confirmation.bookingTitle}
			</p>
			<div class="mt-3 space-y-2.5">
				<div class="flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Calendar class="h-4 w-4" />
					</div>
					<span class="text-sm font-medium text-foreground">{dateLabel}</span>
				</div>
				<div class="flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Clock class="h-4 w-4" />
					</div>
					<span class="text-sm font-medium text-foreground">{timeLabel}</span>
				</div>
			</div>
		</div>

		<p class="mt-5 text-[11px] text-muted-foreground/60">
			Times shown in {confirmation.timezone.replace(/_/g, ' ')}
		</p>
	{/if}
</main>
