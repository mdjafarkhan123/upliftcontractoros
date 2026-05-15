<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Lock } from '@lucide/svelte';

	let {
		title,
		description,
		enabled = $bindable(false),
		featureEnabled = true,
		lockedReason,
		onToggle,
		children
	}: {
		title: string;
		description: string;
		enabled?: boolean;
		featureEnabled?: boolean;
		lockedReason?: string;
		onToggle?: (enabled: boolean) => void;
		children?: import('svelte').Snippet;
	} = $props();

	let locked = $derived(!featureEnabled);
</script>

<section
	class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5"
	class:opacity-60={locked}
>
	<header class="flex items-start gap-3">
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2">
				<h3 class="text-base font-semibold text-foreground">{title}</h3>
				{#if locked}
					<Lock class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
				{/if}
			</div>
			<p class="text-xs text-muted-foreground">{description}</p>
			{#if locked && lockedReason}
				<p class="mt-1 text-xs text-muted-foreground">{lockedReason}</p>
			{/if}
		</div>
		<Switch
			bind:checked={enabled}
			disabled={locked}
			onchange={(v) => onToggle?.(v)}
			aria-label={`Toggle ${title}`}
		/>
	</header>

	{#if children && enabled && !locked}
		<div class="flex flex-col gap-3 border-t border-border pt-4">
			{@render children()}
		</div>
	{/if}
</section>
