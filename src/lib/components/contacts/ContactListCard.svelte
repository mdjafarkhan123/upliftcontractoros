<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatRelativeShort } from '$lib/utils/format';
	import { formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { TEMPERATURE_META, type LeadTemperature } from '$lib/contacts/temperature';
	import ContactAvatar from './ContactAvatar.svelte';
	import { cn } from '$lib/utils/cn';
	import { Check, Phone, MessageSquare } from '@lucide/svelte';

	let {
		id,
		full_name,
		company_name = null,
		avatar_url = null,
		phone,
		email,
		status,
		assignee_name,
		lead_temperature = null,
		sms_opt_out,
		tags = [],
		last_contacted_at = null,
		selectable = false,
		selected = false,
		onToggleSelect
	}: {
		id: string;
		full_name: string;
		company_name?: string | null;
		avatar_url?: string | null;
		phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		lead_temperature?: LeadTemperature | null;
		sms_opt_out?: boolean;
		tags?: string[];
		last_contacted_at?: string | null;
		selectable?: boolean;
		selected?: boolean;
		onToggleSelect?: (id: string) => void;
	} = $props();

	const temp = $derived(lead_temperature ? TEMPERATURE_META[lead_temperature] : null);

	const visibleTags = $derived(tags.slice(0, 3));
	const extraTagCount = $derived(Math.max(0, tags.length - visibleTags.length));

	const statusVariant = $derived(
		status === 'customer' ? 'success' : status === 'archived' ? 'warning' : 'info'
	);
	const statusLabel = $derived(
		status === 'customer' ? 'Customer' : status === 'archived' ? 'Archived' : 'Lead'
	);
	const isArchived = $derived(status === 'archived');
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
			<ContactAvatar name={full_name} src={avatar_url} {status} class="h-11 w-11 text-sm ring-1" />
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<h3 class="truncate text-base font-semibold text-foreground">{full_name}</h3>
					{#if company_name}
						<p class="truncate text-xs font-medium text-muted-foreground">{company_name}</p>
					{/if}
					<p class="truncate text-sm text-muted-foreground">
						{phone ? formatPhoneDisplay(phone) : 'No phone'}
					</p>
					{#if email}
						<p class="truncate text-xs text-muted-foreground">{email}</p>
					{/if}
				</div>
				<div class="flex shrink-0 flex-col items-end gap-1">
					<Badge variant={statusVariant} label={statusLabel} />
					{#if temp}
						<span
							class={cn(
								'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
								temp.badge
							)}
						>
							<span class={cn('h-1.5 w-1.5 rounded-full', temp.dot)}></span>
							{temp.label}
						</span>
					{/if}
				</div>
			</div>
			<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				{#if assignee_name}
					<span>Assigned to {assignee_name}</span>
				{:else}
					<span class="italic">Unassigned</span>
				{/if}
				<span aria-hidden="true">•</span>
				{#if last_contacted_at}
					<span>Last contacted {formatRelativeShort(last_contacted_at)}</span>
				{:else}
					<span class="italic">Never contacted</span>
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
			{#if !selectable && phone}
				<div class="mt-2.5 flex items-center gap-2">
					<a
						href={`tel:${phone}`}
						onclick={(e) => e.stopPropagation()}
						class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-foreground"
						aria-label={`Call ${full_name}`}
					>
						<Phone class="h-3.5 w-3.5" />
						Call
					</a>
					{#if !sms_opt_out}
						<a
							href={`sms:${phone}`}
							onclick={(e) => e.stopPropagation()}
							class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-foreground"
							aria-label={`Text ${full_name}`}
						>
							<MessageSquare class="h-3.5 w-3.5" />
							Text
						</a>
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
