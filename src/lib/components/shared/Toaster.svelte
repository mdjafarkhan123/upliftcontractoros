<script lang="ts">
	import { CheckCircle2, AlertCircle, Info, X } from '@lucide/svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast, type ToastVariant } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';

	const VARIANT_CLASSES: Record<ToastVariant, string> = {
		success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
		error: 'border-destructive/30 bg-destructive/10 text-destructive',
		info: 'border-primary/30 bg-primary/10 text-primary'
	};

	const VARIANT_ICONS = {
		success: CheckCircle2,
		error: AlertCircle,
		info: Info
	} as const;
</script>

<!-- Stack: bottom on mobile (above bottom nav), top-right on desktop -->
<div
	class={cn(
		'pointer-events-none fixed z-[100] flex flex-col gap-2 px-4',
		'inset-x-0 bottom-[calc(var(--bottom-nav-height,64px)+env(safe-area-inset-bottom)+12px)]',
		'md:inset-auto md:right-4 md:top-4 md:bottom-auto md:max-w-sm md:px-0'
	)}
	aria-live="polite"
	aria-atomic="false"
>
	{#each toast.items as t (t.id)}
		{@const Icon = VARIANT_ICONS[t.variant]}
		<div
			in:fly={{ y: 16, duration: 180, easing: cubicOut }}
			out:fade={{ duration: 140 }}
			role={t.variant === 'error' ? 'alert' : 'status'}
			class={cn(
				'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card/95 px-3.5 py-3 shadow-lg backdrop-blur',
				'text-sm text-foreground',
				VARIANT_CLASSES[t.variant]
			)}
		>
			<Icon class="mt-0.5 h-4 w-4 shrink-0" />
			<div class="min-w-0 flex-1">
				<p class="font-medium leading-snug text-foreground">{t.message}</p>
				{#if t.description}
					<p class="mt-0.5 text-xs leading-snug text-muted-foreground">{t.description}</p>
				{/if}
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
				onclick={() => toast.dismiss(t.id)}
				aria-label="Dismiss notification"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
	{/each}
</div>
