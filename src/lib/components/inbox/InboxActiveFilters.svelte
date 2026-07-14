<script lang="ts">
	import type { AssigneeFilter } from '$lib/stores/inbox.svelte';

	let {
		assignee = $bindable<AssigneeFilter>('all'),
		tag = $bindable<string>(''),
		unread = $bindable<boolean>(false),
		canViewAll = true,
		onClearAssignee,
		onClearTag,
		onClearUnread
	}: {
		assignee?: AssigneeFilter;
		tag?: string;
		unread?: boolean;
		canViewAll?: boolean;
		onClearAssignee?: () => void;
		onClearTag?: () => void;
		onClearUnread?: () => void;
	} = $props();

	type Chip = {
		key: string;
		label: string;
		icon: string;
		onRemove: () => void;
	};

	const chips = $derived.by<Chip[]>(() => {
		const out: Chip[] = [];
		if (canViewAll && assignee !== 'all') {
			out.push({
				key: 'assignee',
				label: assignee === 'me' ? 'Mine' : 'Unassigned',
				icon: assignee === 'me' ? 'ri-user-3-line' : 'ri-group-line',
				onRemove: () => onClearAssignee?.()
			});
		}
		if (tag !== '') {
			out.push({
				key: 'tag',
				label: `#${tag}`,
				icon: 'ri-price-tag-3-line',
				onRemove: () => onClearTag?.()
			});
		}
		if (unread) {
			out.push({
				key: 'unread',
				label: 'Unread',
				icon: 'ri-sparkling-line',
				onRemove: () => onClearUnread?.()
			});
		}
		return out;
	});
</script>

{#if chips.length > 0}
	<div class="inbox-active" role="group" aria-label="Active filters">
		<span class="inbox-active__label">Active</span>
		{#each chips as c (c.key)}
			<span class="inbox-active__chip">
				<i class={c.icon} aria-hidden="true"></i>
				{c.label}
				<button
					type="button"
					aria-label={`Remove ${c.label} filter`}
					onclick={c.onRemove}
					class="inbox-active__remove"
				>
					<i class="ri-close-line" aria-hidden="true"></i>
				</button>
			</span>
		{/each}
	</div>
{/if}
