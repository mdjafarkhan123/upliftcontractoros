<script lang="ts">
	import { formatDateTime } from '$lib/utils/format';
	import { Calendar, Clock, User } from '@lucide/svelte';

	let {
		scheduled_start,
		scheduled_end,
		assignee_name
	}: {
		scheduled_start: string | null;
		scheduled_end: string | null;
		assignee_name: string | null;
	} = $props();
</script>

<section class="rounded-xl border border-border bg-card p-4">
	<h2 class="text-sm font-semibold text-foreground">Schedule</h2>
	<dl class="mt-3 space-y-2 text-sm">
		<div class="flex items-start gap-2">
			<Calendar class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0">
				<dt class="text-xs text-muted-foreground">Start</dt>
				<dd class="text-foreground">
					{scheduled_start ? formatDateTime(scheduled_start) : '—'}
				</dd>
			</div>
		</div>
		<div class="flex items-start gap-2">
			<Clock class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0">
				<dt class="text-xs text-muted-foreground">End</dt>
				<dd class="text-foreground">
					{scheduled_end ? formatDateTime(scheduled_end) : '—'}
				</dd>
			</div>
		</div>
		<div class="flex items-start gap-2">
			<User class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0">
				<dt class="text-xs text-muted-foreground">Assigned to</dt>
				<dd class="text-foreground">
					{#if assignee_name}
						{assignee_name}
					{:else}
						<span class="italic text-muted-foreground">Unassigned</span>
					{/if}
				</dd>
			</div>
		</div>
	</dl>
</section>
