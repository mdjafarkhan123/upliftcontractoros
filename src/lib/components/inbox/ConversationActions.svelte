<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Input from '$lib/components/ui/input/input.svelte';
	import SnoozeMenu from './SnoozeMenu.svelte';
	import type { ConversationDetail, SnoozePreset } from '$lib/stores/inbox.svelte';

	type AssigneeOption = { id: string; full_name: string };

	let {
		conversation,
		canManage = true,
		assignees = [],
		currentMemberId,
		orgTags = [],
		onSnooze,
		onUnsnooze,
		onClose,
		onReopen,
		onAssign,
		onUpdateTags
	}: {
		conversation: ConversationDetail | null;
		canManage?: boolean;
		assignees?: AssigneeOption[];
		currentMemberId?: string;
		orgTags?: string[];
		onSnooze: (preset: SnoozePreset) => Promise<void> | void;
		onUnsnooze: () => Promise<void> | void;
		onClose: () => Promise<void> | void;
		onReopen: () => Promise<void> | void;
		onAssign: (memberId: string | null, name: string | null) => Promise<void> | void;
		onUpdateTags?: (tags: string[]) => Promise<void> | void;
	} = $props();

	const status = $derived(conversation?.status ?? 'open');
	const isSnoozed = $derived(status === 'snoozed');
	const isClosed = $derived(status === 'closed');
	const assignedTo = $derived(conversation?.assigned_to ?? null);
	const currentTags = $derived(conversation?.tags ?? []);

	let tagInput = $state('');
	let tagPanelOpen = $state(false);

	const suggestions = $derived(
		tagInput.trim()
			? orgTags
					.filter((t) => t.includes(tagInput.trim().toLowerCase()) && !currentTags.includes(t))
					.slice(0, 6)
			: orgTags.filter((t) => !currentTags.includes(t)).slice(0, 6)
	);

	function normalizeTag(raw: string): string {
		return raw.trim().toLowerCase().replace(/\s+/g, ' ');
	}

	function addTag(raw: string) {
		const next = normalizeTag(raw);
		if (!next || currentTags.includes(next) || currentTags.length >= 5 || !onUpdateTags) return;
		void onUpdateTags([...currentTags, next]);
		tagInput = '';
	}

	function removeTag(t: string) {
		if (!onUpdateTags) return;
		void onUpdateTags(currentTags.filter((x) => x !== t));
	}

	function onTagKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			if (tagInput.trim()) addTag(tagInput);
		} else if (e.key === 'Backspace' && tagInput === '' && currentTags.length > 0) {
			removeTag(currentTags[currentTags.length - 1]);
		}
	}
</script>

<div class="convo-actions">
	{#if !isClosed}
		<SnoozeMenu {isSnoozed} disabled={!canManage} {onSnooze} {onUnsnooze} />
	{/if}

	{#if isClosed}
		<button
			type="button"
			class="convo-actions__btn"
			disabled={!canManage}
			onclick={() => void onReopen()}
		>
			<i class="ri-arrow-go-back-line" aria-hidden="true"></i>
			Reopen
		</button>
	{:else}
		<button
			type="button"
			class="convo-actions__btn"
			disabled={!canManage}
			onclick={() => void onClose()}
		>
			<i class="ri-checkbox-circle-line" aria-hidden="true"></i>
			Close
		</button>
	{/if}

	{#if onUpdateTags}
		<button
			type="button"
			class="convo-actions__btn"
			disabled={!canManage}
			onclick={() => (tagPanelOpen = !tagPanelOpen)}
		>
			<i class="ri-price-tag-3-line" aria-hidden="true"></i>
			Tags
			{#if currentTags.length > 0}
				<span class="convo-actions__count">{currentTags.length}</span>
			{/if}
		</button>
	{/if}

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button {...props} type="button" class="convo-actions__more" aria-label="More actions">
					<i class="ri-more-2-fill" aria-hidden="true"></i>
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			<DropdownMenu.Group>
				<DropdownMenu.Label>Assign to</DropdownMenu.Label>
				<DropdownMenu.Separator />
				{#if currentMemberId}
					<DropdownMenu.Item
						onclick={() => {
							const me = assignees.find((a) => a.id === currentMemberId);
							void onAssign(currentMemberId, me?.full_name ?? 'You');
						}}
					>
						<i class="ri-user-add-line convo-actions__menu-icon" aria-hidden="true"></i>
						Assign to me
					</DropdownMenu.Item>
				{/if}
				{#each assignees.filter((a) => a.id !== currentMemberId) as a (a.id)}
					<DropdownMenu.Item onclick={() => void onAssign(a.id, a.full_name)}>
						{a.full_name}
						{#if a.id === assignedTo}
							<span class="convo-actions__menu-current">Current</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
				{#if assignedTo}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={() => void onAssign(null, null)}>
						<i class="ri-user-unfollow-line convo-actions__menu-icon" aria-hidden="true"></i>
						Unassign
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

{#if onUpdateTags && tagPanelOpen}
	<div class="convo-tags">
		<div class="convo-tags__row">
			{#each currentTags as t (t)}
				<span class="convo-tags__chip">
					#{t}
					<button
						type="button"
						class="convo-tags__chip-remove"
						aria-label={`Remove ${t}`}
						disabled={!canManage}
						onclick={() => removeTag(t)}
					>
						<i class="ri-close-line" aria-hidden="true"></i>
					</button>
				</span>
			{/each}
			{#if currentTags.length < 5}
				<Input
					type="text"
					class="convo-tags__input"
					bind:value={tagInput}
					onkeydown={onTagKey}
					placeholder="Add tag…"
					disabled={!canManage}
				/>
			{/if}
		</div>
		{#if suggestions.length > 0 && currentTags.length < 5}
			<div class="convo-tags__suggestions">
				{#each suggestions as s (s)}
					<button type="button" class="convo-tags__suggestion" onclick={() => addTag(s)}>
						#{s}
					</button>
				{/each}
			</div>
		{/if}
		<p class="convo-tags__hint">Max 5 tags. Press Enter or comma to add.</p>
	</div>
{/if}
