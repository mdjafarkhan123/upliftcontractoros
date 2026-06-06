<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { cn } from '$lib/utils/cn';
	import { Check } from '@lucide/svelte';

	let {
		id,
		full_name,
		phone,
		email,
		status,
		assignee_name,
		sms_opt_out,
		tags = [],
		selectable = false,
		selected = false,
		onToggleSelect
	}: {
		id: string;
		full_name: string;
		phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		sms_opt_out?: boolean;
		tags?: string[];
		selectable?: boolean;
		selected?: boolean;
		onToggleSelect?: (id: string) => void;
	} = $props();

	const visibleTags = $derived(tags.slice(0, 3));
	const extraTagCount = $derived(Math.max(0, tags.length - visibleTags.length));

	const statusVariant = $derived(
		status === 'customer' ? 'success' : status === 'archived' ? 'warning' : 'info'
	);
	const statusLabel = $derived(
		status === 'customer' ? 'Customer' : status === 'archived' ? 'Archived' : 'Lead'
	);
	const isArchived = $derived(status === 'archived');
	const initials = $derived(
		full_name
			.split(/\s+/)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.slice(0, 2)
			.join('')
	);
</script>

{#snippet inner()}
	<div class="flex items-start gap-3">
		{#if selectable}
			<div
				class={cn(
					'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
					selected
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border bg-card text-transparent'
				)}
			>
				<Check class="h-5 w-5" />
			</div>
		{:else}
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15"
			>
				{initials || '?'}
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<h3 class="truncate text-base font-semibold text-foreground">{full_name}</h3>
					<p class="truncate text-sm text-muted-foreground">
						{phone ? formatPhoneDisplay(phone) : 'No phone'}
					</p>
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
			{#if visibleTags.length > 0}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each visibleTags as t (t)}
						<span
							class={cn(
								'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
								isDestructiveTag(t)
									? 'border-destructive/30 bg-destructive/5 text-destructive'
									: 'border-border bg-muted/40 text-muted-foreground'
							)}
						>
							{formatTagLabel(t)}
						</span>
					{/each}
					{#if extraTagCount > 0}
						<span
							class="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
						>
							+{extraTagCount}
						</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#if selectable}
	<button
		type="button"
		aria-pressed={selected}
		onclick={() => onToggleSelect?.(id)}
		class={cn(
			'group block w-full rounded-xl border border-border/70 bg-card p-4 text-left shadow-card transition-all duration-150 ease-out active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10',
			selected && 'border-primary/50 bg-primary/5',
			isArchived && 'opacity-70 saturate-50'
		)}
	>
		{@render inner()}
	</button>
{:else}
	<a
		href={`/contacts/${id}`}
		class={cn(
			'group block rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10',
			isArchived && 'opacity-70 saturate-50'
		)}
	>
		{@render inner()}
	</a>
{/if}
