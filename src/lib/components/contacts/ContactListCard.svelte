<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';

	let {
		id,
		full_name,
		phone,
		email,
		status,
		assignee_name,
		sms_opt_out
	}: {
		id: string;
		full_name: string;
		phone: string;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		sms_opt_out?: boolean;
	} = $props();

	const statusVariant = $derived(
		status === 'customer' ? 'success' : status === 'archived' ? 'default' : 'info'
	);
	const statusLabel = $derived(
		status === 'customer' ? 'Customer' : status === 'archived' ? 'Archived' : 'Lead'
	);
	const initials = $derived(
		full_name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('')
	);
</script>

<a
	href={`/contacts/${id}`}
	class="group block rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10"
>
	<div class="flex items-start gap-3">
		<div
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15"
		>
			{initials || '?'}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<h3 class="truncate text-base font-semibold text-foreground">{full_name}</h3>
					<p class="truncate text-sm text-muted-foreground">{formatPhoneDisplay(phone)}</p>
					{#if email}
						<p class="truncate text-xs text-muted-foreground">{email}</p>
					{/if}
				</div>
				<Badge variant={statusVariant} label={statusLabel} />
			</div>
			<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
				{#if assignee_name}
					<span>Assigned to {assignee_name}</span>
				{:else}
					<span class="italic">Unassigned</span>
				{/if}
				{#if sms_opt_out}
					<span aria-hidden="true">•</span>
					<span class="font-medium text-amber-700 dark:text-amber-400">SMS opted out</span>
				{/if}
			</div>
		</div>
	</div>
</a>
