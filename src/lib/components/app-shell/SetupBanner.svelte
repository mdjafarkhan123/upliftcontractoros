<script lang="ts">
	let { onDismiss } = $props<{ onDismiss: () => void }>();
</script>

<div
	class="flex items-center gap-3 border-b border-amber-200/50 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
>
	<i class="ri-sparkling-line h-4 w-4 shrink-0" aria-hidden="true"></i>
	<div class="flex-1 leading-snug">
		<span class="font-medium">Finish setting up your workspace.</span>
		<a href="/settings" class="ml-2 underline underline-offset-2 hover:no-underline">Open settings</a>
	</div>
	<button
		type="button"
		onclick={onDismiss}
		class="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
		aria-label="Dismiss"
	>
		<i class="ri-close-line" aria-hidden="true"></i>
	</button>
</div>
