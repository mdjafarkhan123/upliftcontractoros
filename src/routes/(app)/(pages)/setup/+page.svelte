<script lang="ts">
	import { Loader2 } from '@lucide/svelte';
</script>

<svelte:head>
	<title>Setting up</title>
</svelte:head>

<div
	class="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4 px-6 text-center"
>
	<Loader2 class="h-10 w-10 animate-spin text-primary" />
	<h1 class="text-xl font-semibold text-foreground md:text-2xl">Your system is being set up</h1>
	<p class="max-w-md text-sm text-muted-foreground">
		We're preparing your workspace. This usually takes less than a minute. You'll be redirected
		automatically when it's ready.
	</p>
</div>
