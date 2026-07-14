<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Switch } from '$lib/components/ui/switch';
	import type { AccentKey } from './cardVisuals';

	let {
		icon,
		accent,
		title,
		description,
		meta,
		enabled = $bindable(false),
		locked = false,
		lockedReason,
		expanded = false,
		onToggle,
		dirty = false,
		switchDisabled = false,
		children
	}: {
		icon: string;
		accent: AccentKey;
		title: string;
		description: string;
		meta?: string;
		enabled?: boolean;
		locked?: boolean;
		lockedReason?: string;
		expanded?: boolean;
		onToggle?: () => void;
		dirty?: boolean;
		switchDisabled?: boolean;
		children?: Snippet;
	} = $props();
</script>

<section class="auto-card" class:auto-card--open={expanded} class:auto-card--locked={locked}>
	<div class="auto-card__head">
		<button
			type="button"
			class="auto-card__trigger"
			disabled={locked}
			aria-expanded={expanded}
			onclick={() => onToggle?.()}
		>
			<span class="auto-tile auto-tile--{accent}">
				<i class={icon} aria-hidden="true"></i>
			</span>
			<span class="auto-card__text">
				<span class="auto-card__title-row">
					<span class="auto-card__title">{title}</span>
					{#if locked}<i class="ri-lock-line auto-card__lock" aria-hidden="true"></i>{/if}
					{#if dirty && !locked}<span class="auto-card__dot" aria-label="Unsaved changes"
						></span>{/if}
				</span>
				<span class="auto-card__desc">{description}</span>
				<span class="auto-card__meta"
					>{locked ? (lockedReason ?? 'Not available on your plan') : (meta ?? '')}</span
				>
			</span>
			{#if !locked}
				<i class="ri-arrow-down-s-line auto-card__chevron" aria-hidden="true"></i>
			{/if}
		</button>
		<Switch
			bind:checked={enabled}
			disabled={locked || switchDisabled}
			aria-label={`Toggle ${title}`}
		/>
	</div>

	{#if expanded && !locked}
		<div class="auto-card__body">
			{@render children?.()}
		</div>
	{/if}
</section>
