<script lang="ts">
	let {
		message,
		variant = 'destructive'
	}: {
		message: string;
		variant?: 'destructive' | 'success' | 'default';
	} = $props();

	const styles = {
		destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
		success: 'border-primary/30 bg-primary/10 text-foreground',
		default: 'border-border/60 bg-muted/40 text-foreground'
	};

	const icons = {
		destructive: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
		success: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
		default: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`
	};
</script>

<div
	role="alert"
	class="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm {styles[variant]}"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="mt-0.5 shrink-0"
		aria-hidden="true"
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html icons[variant]}
	</svg>
	<p class="leading-relaxed">{message}</p>
</div>
