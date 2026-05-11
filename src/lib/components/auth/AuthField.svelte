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
		class?: string;
	} = $props();
</script>

<div class="space-y-1.5 {className}">
	<label
		for={id}
		class="block text-sm font-semibold text-foreground/80"
	>
		{label}
	</label>
	<input
		{id}
		name={id}
		{type}
		{value}
		{placeholder}
		{autocomplete}
		{required}
		{minlength}
		class="flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 focus:bg-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
	/>
</div>
