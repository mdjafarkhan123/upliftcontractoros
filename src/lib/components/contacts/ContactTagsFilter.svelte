<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { SUGGESTED_CONTACT_TAGS, formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';

	let {
		value = $bindable<string>(''),
		onChange
	}: {
		value?: string;
		onChange?: (next: string) => void;
	} = $props();

	function set(next: string) {
		value = next === value ? '' : next;
		onChange?.(value);
	}
</script>

<div
	class="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	role="group"
	aria-label="Filter by tag"
>
	{#each SUGGESTED_CONTACT_TAGS as tag (tag)}
		{@const active = value === tag}
		{@const destructive = isDestructiveTag(tag)}
		<button
			type="button"
			onclick={() => set(tag)}
			aria-pressed={active}
			class={cn(
				'inline-flex h-9 shrink-0 snap-start items-center rounded-full border px-3 text-xs font-medium transition-colors',
				active
					? destructive
						? 'border-destructive bg-destructive text-destructive-foreground'
						: 'border-primary bg-primary text-primary-foreground'
					: destructive
						? 'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10'
						: 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground'
			)}
		>
			{formatTagLabel(tag)}
		</button>
	{/each}
</div>
