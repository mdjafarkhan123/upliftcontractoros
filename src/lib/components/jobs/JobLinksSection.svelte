<script lang="ts">
	import { ChevronRight, FileText, Calendar, GitBranch } from '@lucide/svelte';

	let {
		opportunity_id,
		invoice_count,
		appointment_count
	}: {
		opportunity_id: string;
		invoice_count: number;
		appointment_count: number;
	} = $props();
</script>

<section class="rounded-xl border border-border bg-card">
	<a
		href={`/pipeline/${opportunity_id}`}
		class="flex items-center justify-between gap-3 border-b border-border p-4 transition-colors hover:bg-accent/40 active:bg-accent/60"
	>
		<div class="flex items-center gap-3">
			<GitBranch class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium">View opportunity</span>
		</div>
		<ChevronRight class="h-4 w-4 text-muted-foreground" />
	</a>

	<div class="flex items-center justify-between gap-3 border-b border-border p-4">
		<div class="flex items-center gap-3">
			<FileText class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium">Invoices</span>
		</div>
		<span class="text-sm text-muted-foreground">{invoice_count}</span>
	</div>

	<div class="flex items-center justify-between gap-3 p-4">
		<div class="flex items-center gap-3">
			<Calendar class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium">Appointments</span>
		</div>
		<span class="text-sm text-muted-foreground">{appointment_count}</span>
	</div>
</section>
