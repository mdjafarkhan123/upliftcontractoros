<script lang="ts">
	import { goto } from '$app/navigation';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { contactDetailStore } from '$lib/stores/contactDetail.svelte';
	import type { ContactListItem } from '$lib/stores/contacts.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import ContactAvatar from './ContactAvatar.svelte';
	import RowActionsMenu, { type RowAction } from '$lib/components/shared/RowActionsMenu.svelte';
	import ListTable from '$lib/components/shared/ListTable.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { formatRelativeShort } from '$lib/utils/format';
	import { formatTagLabel, isDestructiveTag } from '$lib/contacts/tags';
	import { TEMPERATURE_META } from '$lib/contacts/temperature';
	import { leadSourceLabel } from '$lib/contacts/leadSource';

	let {
		items,
		selectable = false,
		selected,
		onToggleSelect,
		onToggleAll,
		allSelected = false,
		onArchiveRequest,
		onRestoreRequest,
		onDeleteRequest
	}: {
		items: ContactListItem[];
		selectable?: boolean;
		selected?: Set<string>;
		onToggleSelect?: (id: string) => void;
		onToggleAll?: () => void;
		allSelected?: boolean;
		onArchiveRequest?: (id: string, name: string) => void;
		onRestoreRequest?: (id: string, name: string) => void;
		onDeleteRequest?: (id: string, name: string) => void;
	} = $props();

	function statusVariant(s: ContactListItem['status']) {
		return s === 'customer' ? 'success' : s === 'archived' ? 'warning' : 'info';
	}
	function statusLabel(s: ContactListItem['status']) {
		return s === 'customer' ? 'Customer' : s === 'archived' ? 'Archived' : 'Lead';
	}

	function contactActions(c: ContactListItem): RowAction[] {
		const actions: RowAction[] = [];
		if (c.status === 'archived') {
			if (onRestoreRequest)
				actions.push({
					key: 'restore',
					label: 'Restore contact',
					icon: 'ri-arrow-go-back-line',
					onSelect: () => onRestoreRequest(c.id, c.full_name)
				});
		} else {
			actions.push({
				key: 'edit',
				label: 'Edit contact',
				icon: 'ri-pencil-line',
				onSelect: () => goto(`/contacts/${c.id}`)
			});
			if (onArchiveRequest)
				actions.push({
					key: 'archive',
					label: 'Archive contact',
					icon: 'ri-archive-line',
					onSelect: () => onArchiveRequest(c.id, c.full_name)
				});
		}
		if (onDeleteRequest)
			actions.push({
				key: 'delete',
				label: 'Delete contact',
				icon: 'ri-delete-bin-line',
				destructive: true,
				onSelect: () => onDeleteRequest(c.id, c.full_name)
			});
		return actions;
	}
</script>

<ListTable ariaLabel="Contacts">
	{#snippet head()}
		{#if selectable}
			<th class="list-table__th list-table__th--check">
				<button
					type="button"
					onclick={onToggleAll}
					aria-label="Select all contacts"
					class="contact-check"
					class:contact-check--on={allSelected}
				>
					{#if allSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
				</button>
			</th>
		{/if}
		<th class="list-table__th">Contact</th>
		<th class="list-table__th list-table__th--xl">Email</th>
		<th class="list-table__th list-table__th--lg">Phone</th>
		<th class="list-table__th">Status</th>
		<th class="list-table__th list-table__th--lg">Temp</th>
		<th class="list-table__th list-table__th--xl">Last contacted</th>
		<th class="list-table__th list-table__th--xl">Assignee</th>
		<th class="list-table__th list-table__th--xxl">Source</th>
		<th class="list-table__th list-table__th--xxl">Tags</th>
		<th class="list-table__th list-table__th--actions"></th>
	{/snippet}

	{#snippet body()}
		{#each items as c (c.id)}
			{@const isSelected = selected?.has(c.id) ?? false}
			{@const visibleTags = c.tags.slice(0, 2)}
			{@const extraTags = Math.max(0, c.tags.length - 2)}
			<tr
				class="list-table__row"
				class:list-table__row--selected={isSelected}
				use:prefetchOnIntent={() => {
					if (!selectable) contactDetailStore.prefetch(c.id);
				}}
				onclick={selectable ? () => onToggleSelect?.(c.id) : () => goto(`/contacts/${c.id}`)}
			>
				{#if selectable}
					<td class="list-table__td list-table__td--check">
						<span class="contact-check" class:contact-check--on={isSelected}>
							{#if isSelected}<i class="ri-check-line" aria-hidden="true"></i>{/if}
						</span>
					</td>
				{/if}

				<!-- Contact: avatar + name -->
				<td class="list-table__td">
					<div class="contact-table__contact">
						<ContactAvatar name={c.full_name} src={c.avatar_url} status={c.status} size={36} />
						<div class="contact-table__contact-body">
							{#if selectable}
								<span class="contact-table__name">{c.full_name}</span>
							{:else}
								<a
									href="/contacts/{c.id}"
									onclick={(e) => e.stopPropagation()}
									class="contact-table__name"
								>
									{c.full_name}
								</a>
							{/if}
							{#if c.company_name}
								<p class="contact-table__company">{c.company_name}</p>
							{/if}
							{#if c.sms_opt_out}
								<p class="contact-table__optout">SMS opted out</p>
							{/if}
						</div>
					</div>
				</td>

				<!-- Email -->
				<td class="list-table__td list-table__td--xl">
					<span class="contact-table__email">{c.email ?? '—'}</span>
				</td>

				<!-- Phone -->
				<td class="list-table__td list-table__td--lg">
					<span class="contact-table__muted">
						{c.phone ? formatPhoneDisplay(c.phone) : '—'}
					</span>
				</td>

				<!-- Status -->
				<td class="list-table__td">
					<Badge variant={statusVariant(c.status)} label={statusLabel(c.status)} />
				</td>

				<!-- Temperature -->
				<td class="list-table__td list-table__td--lg">
					{#if c.lead_temperature}
						{@const meta = TEMPERATURE_META[c.lead_temperature]}
						<span class="temp-chip temp-chip--{c.lead_temperature}">
							<span class="temp-chip__dot"></span>
							{meta.label}
						</span>
					{:else}
						<span class="contact-table__dash">—</span>
					{/if}
				</td>

				<!-- Last contacted -->
				<td class="list-table__td list-table__td--xl">
					{#if c.last_contacted_at}
						<span class="contact-table__muted">{formatRelativeShort(c.last_contacted_at)}</span>
					{:else}
						<span class="contact-table__never">Never</span>
					{/if}
				</td>

				<!-- Assignee -->
				<td class="list-table__td list-table__td--xl">
					{#if c.assignee_name}
						<span class="contact-table__muted">{c.assignee_name}</span>
					{:else}
						<span class="contact-table__never">Unassigned</span>
					{/if}
				</td>

				<!-- Source -->
				<td class="list-table__td list-table__td--xxl">
					{#if c.lead_source && c.lead_source !== 'manual'}
						<span class="contact-table__muted">{leadSourceLabel(c.lead_source)}</span>
					{:else}
						<span class="contact-table__dash">—</span>
					{/if}
				</td>

				<!-- Tags -->
				<td class="list-table__td list-table__td--xxl">
					{#if visibleTags.length > 0}
						<div class="contact-table__tags">
							{#each visibleTags as t (t)}
								<span class="tag-chip" class:tag-chip--destructive={isDestructiveTag(t)}>
									{formatTagLabel(t)}
								</span>
							{/each}
							{#if extraTags > 0}
								<span class="tag-chip">+{extraTags}</span>
							{/if}
						</div>
					{:else}
						<span class="contact-table__dash">—</span>
					{/if}
				</td>

				<!-- Actions -->
				<td class="list-table__td list-table__td--actions" onclick={(e) => e.stopPropagation()}>
					{#if !selectable}
						<RowActionsMenu actions={contactActions(c)} label="Actions for {c.full_name}" />
					{/if}
				</td>
			</tr>
		{/each}
	{/snippet}
</ListTable>
