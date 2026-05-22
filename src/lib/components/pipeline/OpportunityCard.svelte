<script lang="ts">
	import { formatCurrency } from '$lib/utils/format';
	import * as Avatar from '$lib/components/ui/avatar';

	type Props = {
		title: string;
		contact_name: string;
		value: string | null;
		assignee_name: string | null;
	};

	let { title, contact_name, value, assignee_name }: Props = $props();

	const initials = $derived(
		(assignee_name ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]!.toUpperCase())
			.join('')
	);
</script>

<div
	class="rounded-lg border border-border/60 bg-card p-3 shadow-card transition-all duration-150 ease-out hover:border-border hover:bg-muted/40 hover:shadow-dropdown active:cursor-grabbing"
>
	<div class="mb-1.5 truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
		{contact_name}
	</div>
	<div class="mb-3 line-clamp-2 text-sm font-semibold text-foreground">{title}</div>
	<div class="flex items-center justify-between">
		<span class="text-sm font-semibold tabular-nums text-foreground">
			{value ? formatCurrency(value) : '—'}
		</span>
		{#if assignee_name}
			<Avatar.Root class="h-7 w-7">
				<Avatar.Fallback class="bg-primary/10 text-[10px] font-semibold text-primary">
					{initials}
				</Avatar.Fallback>
			</Avatar.Root>
		{/if}
	</div>
</div>
