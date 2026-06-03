<script lang="ts">
	let {
		id,
		label,
		value = '',
		type = 'text',
		placeholder = '',
		autocomplete,
		required = false,
		minlength,
		trailing,
		class: className = ''
	}: {
		id: string;
		label: string;
		value?: string;
		type?: string;
		placeholder?: string;
		autocomplete?: import('svelte/elements').HTMLInputAttributes['autocomplete'];
		required?: boolean;
		minlength?: number;
		trailing?: import('svelte').Snippet;
		class?: string;
	} = $props();
</script>

<div class="space-y-1.5 {className}">
	<div class="flex items-center justify-between">
		<label
			for={id}
			class="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
		>
			{label}{#if required}<span class="ml-0.5 text-destructive">*</span>{/if}
		</label>
		{#if trailing}{@render trailing()}{/if}
	</div>
	<input
		{id}
		name={id}
		{type}
		{value}
		{placeholder}
		{autocomplete}
		{required}
		{minlength}
		class="flex h-11 w-full rounded-xl border border-border/70 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-all duration-150 focus:border-primary/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
	/>
</div>
