<script lang="ts">
	import CalendarX from '@lucide/svelte/icons/calendar-x';
</script>

<svelte:head>
	<title>Booking unavailable</title>
</svelte:head>

<main
	class="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center"
>
	<div
		class="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-[0_20px_50px_-20px_hsl(0_0%_0%/0.5)]"
	>
		<CalendarX class="h-8 w-8 text-muted-foreground" />
	</div>

	<h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
		Booking unavailable
	</h1>
	<p class="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
		This booking page is not currently available.
	</p>
</main>
