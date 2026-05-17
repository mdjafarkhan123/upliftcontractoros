<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatDateTime } from '$lib/utils/format';
	import { Clock, CalendarClock, CheckCircle2, MessageSquare } from '@lucide/svelte';

	let {
		last_contacted_at,
		next_follow_up_at,
		converted_at,
		preferred_contact_method
	}: {
		last_contacted_at: string | null;
		next_follow_up_at: string | null;
		converted_at: string | null;
		preferred_contact_method: 'sms' | 'call' | 'email' | 'whatsapp' | 'messenger' | null;
	} = $props();

	const followUpDue = $derived(
		next_follow_up_at !== null && new Date(next_follow_up_at).getTime() <= Date.now()
	);

	const methodLabel = $derived(
		preferred_contact_method
			? preferred_contact_method[0].toUpperCase() + preferred_contact_method.slice(1)
			: null
	);
</script>

<section class="rounded-2xl border border-border bg-card p-4 md:p-5">
	{#if followUpDue}
		<div class="mb-3">
			<Badge variant="warning" label="Follow up today" />
		</div>
	{/if}

	<dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="flex items-start gap-3">
			<Clock class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Last contacted
				</dt>
				<dd class="mt-0.5 text-sm text-foreground">
					{last_contacted_at ? formatDateTime(last_contacted_at) : '—'}
				</dd>
			</div>
		</div>

		<div class="flex items-start gap-3">
			<CalendarClock
				class={`mt-0.5 h-4 w-4 shrink-0 ${followUpDue ? 'text-amber-600' : 'text-muted-foreground'}`}
			/>
			<div class="min-w-0">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Next follow-up
				</dt>
				<dd class="mt-0.5 text-sm text-foreground">
					{next_follow_up_at ? formatDateTime(next_follow_up_at) : '—'}
				</dd>
			</div>
		</div>

		<div class="flex items-start gap-3">
			<CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Converted
				</dt>
				<dd class="mt-0.5 text-sm text-foreground">
					{converted_at ? formatDateTime(converted_at) : '—'}
				</dd>
			</div>
		</div>

		<div class="flex items-start gap-3">
			<MessageSquare class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Preferred method
				</dt>
				<dd class="mt-0.5 text-sm text-foreground">{methodLabel ?? '—'}</dd>
			</div>
		</div>
	</dl>
</section>
