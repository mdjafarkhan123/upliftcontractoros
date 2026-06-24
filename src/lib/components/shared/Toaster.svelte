<script lang="ts">
	import { CheckCircle2, AlertCircle, Info, X, ArrowRight } from '@lucide/svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast, type ToastVariant } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils/cn';

	const ACCENT: Record<ToastVariant, { bar: string; icon: string; IconComponent: typeof CheckCircle2 }> = {
		success: { bar: 'bg-emerald-500', icon: 'text-emerald-500', IconComponent: CheckCircle2 },
		error:   { bar: 'bg-red-500',     icon: 'text-red-500',     IconComponent: AlertCircle },
		info:    { bar: 'bg-blue-500',     icon: 'text-blue-500',    IconComponent: Info }
	};
</script>

<!-- Top-center on all screens: always in the contractor's field of view, never buried under sheets or nav -->
<div
	class={cn(
		'pointer-events-none fixed z-[100] flex flex-col gap-2',
		'inset-x-0 top-4 px-4',
		'md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-[400px] md:px-0'
	)}
	aria-live="polite"
	aria-atomic="false"
>
	{#each toast.items as t (t.id)}
		{@const a = ACCENT[t.variant]}
		<div
			in:fly={{ y: -10, duration: 200, easing: cubicOut }}
			out:fade={{ duration: 150 }}
			role={t.variant === 'error' ? 'alert' : 'status'}
			class="pointer-events-auto flex items-stretch overflow-hidden rounded-xl bg-card shadow-xl ring-1 ring-black/8 dark:ring-white/10"
		>
			<!-- Accent stripe -->
			<span class={cn('w-1 shrink-0', a.bar)}></span>

			<!-- Content -->
			<div class="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5">
				<svelte:component this={a.IconComponent} class={cn('mt-0.5 h-4 w-4 shrink-0', a.icon)} />
				<div class="min-w-0 flex-1">
					<p class="text-sm font-semibold leading-snug text-foreground">{t.message}</p>
					{#if t.description}
						<p class="mt-0.5 text-xs leading-snug text-muted-foreground">{t.description}</p>
					{/if}
					{#if t.action}
						<a
							href={t.action.href}
							onclick={() => toast.dismiss(t.id)}
							class={cn(
								'mt-2.5 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline',
								a.icon
							)}
						>
							{t.action.label}
							<ArrowRight class="h-3 w-3 shrink-0" />
						</a>
					{/if}
				</div>
				<button
					type="button"
					class="ml-1 -mr-1 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => toast.dismiss(t.id)}
					aria-label="Dismiss notification"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	{/each}
</div>
