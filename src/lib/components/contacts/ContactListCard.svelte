<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatRelativeShort } from '$lib/utils/format';
	import { formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { TEMPERATURE_META, type LeadTemperature } from '$lib/contacts/temperature';
	import { leadSourceLabel } from '$lib/contacts/leadSource';
	import ContactAvatar from './ContactAvatar.svelte';
	import { goto } from '$app/navigation';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { contactDetailStore } from '$lib/stores/contactDetail.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		id,
		full_name,
		company_name = null,
		avatar_url = null,
		phone,
		email,
		status,
		assignee_name,
		lead_source = null,
		lead_temperature = null,
		sms_opt_out,
		tags = [],
		last_contacted_at = null,
		selectable = false,
		selected = false,
		onToggleSelect,
		onArchiveRequest,
		onRestoreRequest,
		onDeleteRequest
	}: {
		id: string;
		full_name: string;
		company_name?: string | null;
		avatar_url?: string | null;
		phone: string | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		lead_source?: string | null;
		lead_temperature?: LeadTemperature | null;
		sms_opt_out?: boolean;
		tags?: string[];
		last_contacted_at?: string | null;
		selectable?: boolean;
		selected?: boolean;
		onToggleSelect?: (id: string) => void;
		onArchiveRequest?: (id: string, name: string) => void;
		onRestoreRequest?: (id: string, name: string) => void;
		onDeleteRequest?: (id: string, name: string) => void;
	} = $props();

	const temp = $derived(lead_temperature ? TEMPERATURE_META[lead_temperature] : null);
	// "Manual" carries no channel signal — only surface a real lead source.
	const sourceLabel = $derived(
		lead_source && lead_source !== 'manual' ? leadSourceLabel(lead_source) : null
	);

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
	<div class="contact-card__inner">
		{#if selectable}
			<div class="contact-card__check-avatar" class:contact-card__check-avatar--on={selected}>
				<i class="ri-check-line" aria-hidden="true"></i>
			</div>
		{:else}
			<ContactAvatar name={full_name} src={avatar_url} {status} size={44} />
		{/if}
		<div class="contact-card__body">
			<div class="contact-card__top">
				<div class="contact-card__identity">
					<h3 class="contact-card__name">{full_name}</h3>
					{#if company_name}
						<p class="contact-card__company">{company_name}</p>
					{/if}
					<p class="contact-card__contactline">
						{phone ? formatPhoneDisplay(phone) : 'No phone'}
					</p>
					{#if email}
						<p class="contact-card__email">{email}</p>
					{/if}
				</div>
				<div class="contact-card__badges">
					<div class="contact-card__badge-col">
						<Badge variant={statusVariant} label={statusLabel} />
						{#if temp && lead_temperature}
							<span class="temp-chip temp-chip--{lead_temperature}">
								<span class="temp-chip__dot"></span>
								{temp.label}
							</span>
						{/if}
					</div>
					{#if !selectable}
						<div onclick={(e) => e.stopPropagation()} role="none">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									class="contact-menu-trigger"
									aria-label="Actions for {full_name}"
								>
									<i class="ri-more-2-fill" aria-hidden="true"></i>
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									{#if isArchived}
										{#if onRestoreRequest}
											<DropdownMenu.Item onclick={() => onRestoreRequest(id, full_name)}>
												<i class="ri-arrow-go-back-line" aria-hidden="true"></i>
												Restore contact
											</DropdownMenu.Item>
										{/if}
										{#if onDeleteRequest}
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												variant="destructive"
												onclick={() => onDeleteRequest(id, full_name)}
											>
												<i class="ri-delete-bin-line" aria-hidden="true"></i>
												Delete contact
											</DropdownMenu.Item>
										{/if}
									{:else}
										<DropdownMenu.Item onclick={() => goto(`/contacts/${id}`)}>
											<i class="ri-pencil-line" aria-hidden="true"></i>
											Edit contact
										</DropdownMenu.Item>
										{#if onArchiveRequest}
											<DropdownMenu.Item onclick={() => onArchiveRequest(id, full_name)}>
												<i class="ri-archive-line" aria-hidden="true"></i>
												Archive contact
											</DropdownMenu.Item>
										{/if}
										{#if onDeleteRequest}
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												variant="destructive"
												onclick={() => onDeleteRequest(id, full_name)}
											>
												<i class="ri-delete-bin-line" aria-hidden="true"></i>
												Delete contact
											</DropdownMenu.Item>
										{/if}
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					{/if}
				</div>
			</div>
			<div class="contact-card__meta">
				{#if assignee_name}
					<span>Assigned to {assignee_name}</span>
				{:else}
					<span class="contact-card__meta-italic">Unassigned</span>
				{/if}
				<span aria-hidden="true">•</span>
				{#if last_contacted_at}
					<span>Last contacted {formatRelativeShort(last_contacted_at)}</span>
				{:else}
					<span class="contact-card__meta-italic">Never contacted</span>
				{/if}
				{#if sourceLabel}
					<span aria-hidden="true">•</span>
					<span>{sourceLabel}</span>
				{/if}
				{#if sms_opt_out}
					<span aria-hidden="true">•</span>
					<span class="contact-card__meta-optout">SMS opted out</span>
				{/if}
			</div>
			{#if visibleTags.length > 0}
				<div class="contact-card__tag-row">
					{#each visibleTags as t (t)}
						<span class="tag-chip" class:tag-chip--destructive={isDestructiveTag(t)}>
							{formatTagLabel(t)}
						</span>
					{/each}
					{#if extraTagCount > 0}
						<span class="tag-chip">+{extraTagCount}</span>
					{/if}
				</div>
			{/if}
			{#if !selectable && phone}
				<div class="contact-card__quick">
					<a
						href={`tel:${phone}`}
						onclick={(e) => e.stopPropagation()}
						class="contact-card__quick-btn"
						aria-label={`Call ${full_name}`}
					>
						<i class="ri-phone-line" aria-hidden="true"></i>
						Call
					</a>
					{#if !sms_opt_out}
						<a
							href={`sms:${phone}`}
							onclick={(e) => e.stopPropagation()}
							class="contact-card__quick-btn"
							aria-label={`Text ${full_name}`}
						>
							<i class="ri-message-2-line" aria-hidden="true"></i>
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
		class="contact-card"
		class:contact-card--selected={selected}
	>
		{@render inner()}
	</button>
{:else}
	<a
		href={`/contacts/${id}`}
		use:prefetchOnIntent={() => contactDetailStore.prefetch(id)}
		class="contact-card"
	>
		{@render inner()}
	</a>
{/if}
