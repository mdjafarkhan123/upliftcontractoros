<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import type { StatusFilter, AssigneeFilter } from '$lib/stores/inbox.svelte';

	let {
		status = $bindable<StatusFilter>('open'),
		assignee = $bindable<AssigneeFilter>('all'),
		tag = $bindable<string>(''),
		unread = $bindable<boolean>(false),
		orgTags = [] as string[],
		canViewAll = true,
		showUnread = true,
		awaitingCount = 0,
		unassignedCount = 0,
		failedCount = 0,
		onClearAll
	}: {
		status?: StatusFilter;
		assignee?: AssigneeFilter;
		tag?: string;
		unread?: boolean;
		orgTags?: string[];
		canViewAll?: boolean;
		showUnread?: boolean;
		awaitingCount?: number;
		unassignedCount?: number;
		failedCount?: number;
		onClearAll?: () => void;
	} = $props();

	// Quick-triage shortcuts — jump to the relevant view. These mirror the old
	// inline summary chips; none of them is a distinct server filter, so they
	// just set the existing status/assignee dimensions.
	type AttentionChip = {
		key: string;
		label: string;
		icon: string;
		tone: string;
		onClick: () => void;
	};
	const attentionChips = $derived.by<AttentionChip[]>(() => {
		const out: AttentionChip[] = [];
		if (awaitingCount > 0) {
			out.push({
				key: 'awaiting',
				label: `${awaitingCount} awaiting you`,
				icon: 'ri-time-line',
				tone: 'awaiting',
				onClick: () => (status = 'open')
			});
		}
		if (canViewAll && unassignedCount > 0) {
			out.push({
				key: 'unassigned',
				label: `${unassignedCount} unassigned`,
				icon: 'ri-user-unfollow-line',
				tone: 'unassigned',
				onClick: () => (assignee = 'unassigned')
			});
		}
		if (failedCount > 0) {
			out.push({
				key: 'failed',
				label: `${failedCount} delivery failed`,
				icon: 'ri-error-warning-line',
				tone: 'failed',
				onClick: () => (status = 'open')
			});
		}
		return out;
	});

	type AssigneeOption = { key: AssigneeFilter; label: string; icon: string };
	const ASSIGNEE_OPTIONS: AssigneeOption[] = $derived(
		canViewAll
			? [
					{ key: 'all', label: 'All conversations', icon: 'ri-inbox-line' },
					{ key: 'me', label: 'Assigned to me', icon: 'ri-user-3-line' },
					{ key: 'unassigned', label: 'Unassigned', icon: 'ri-group-line' }
				]
			: [
					{ key: 'all' as AssigneeFilter, label: 'All conversations', icon: 'ri-inbox-line' },
					{ key: 'me', label: 'Assigned to me', icon: 'ri-user-3-line' }
				]
	);

	const isFiltered = $derived(assignee !== 'all' || tag !== '' || unread);
</script>

<div class="inbox-filters">
	{#if attentionChips.length > 0}
		<section class="inbox-filters__section">
			<h4 class="inbox-filters__section-title">Needs attention</h4>
			<div class="inbox-filters__attention">
				{#each attentionChips as c (c.key)}
					<button
						type="button"
						onclick={c.onClick}
						class="inbox-filters__attn inbox-filters__attn--{c.tone}"
					>
						<i class={c.icon} aria-hidden="true"></i>
						{c.label}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if canViewAll}
		<section class="inbox-filters__section">
			<h4 class="inbox-filters__section-title">Assigned to</h4>
			<div role="radiogroup" aria-label="Assignee" class="inbox-filters__options">
				{#each ASSIGNEE_OPTIONS as opt (opt.key)}
					{@const active = assignee === opt.key}
					<button
						type="button"
						role="radio"
						aria-checked={active}
						onclick={() => (assignee = opt.key)}
						class="inbox-filters__option"
						class:inbox-filters__option--active={active}
					>
						<span class="inbox-filters__radio" aria-hidden="true">
							{#if active}
								<span class="inbox-filters__radio-dot"></span>
							{/if}
						</span>
						<i class="{opt.icon} inbox-filters__option-icon" aria-hidden="true"></i>
						<span class="inbox-filters__option-label">{opt.label}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if orgTags.length > 0}
		<section class="inbox-filters__section">
			<h4 class="inbox-filters__section-title">Tag</h4>
			<div class="inbox-filters__tags">
				<button
					type="button"
					onclick={() => (tag = '')}
					class="inbox-filters__tag"
					class:inbox-filters__tag--active={tag === ''}
				>
					Any tag
				</button>
				{#each orgTags as t (t)}
					<button
						type="button"
						onclick={() => (tag = tag === t ? '' : t)}
						class="inbox-filters__tag"
						class:inbox-filters__tag--active={tag === t}
					>
						<i class="ri-price-tag-3-line" aria-hidden="true"></i>
						{t}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if showUnread}
		<section class="inbox-filters__switch-row">
			<span class="inbox-filters__switch-label">
				<i class="ri-sparkling-line" aria-hidden="true"></i>
				<label for="unread-toggle">Unread only</label>
			</span>
			<Switch id="unread-toggle" bind:checked={unread} />
		</section>
	{/if}

	{#if isFiltered && onClearAll}
		<div class="inbox-filters__clear">
			<Button type="button" variant="ghost" size="sm" onclick={onClearAll}>
				<i class="ri-refresh-line" aria-hidden="true"></i>
				Clear filters
			</Button>
		</div>
	{/if}
</div>
