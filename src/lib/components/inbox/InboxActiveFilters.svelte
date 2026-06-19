<script lang="ts">
	import { Sparkles, Tag as TagIcon, X, UserCircle2, Users, Inbox } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
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
		icon: typeof Inbox;
		tint: string;
		onRemove: () => void;
	};

	const chips = $derived.by<Chip[]>(() => {
		const out: Chip[] = [];
		if (canViewAll && assignee !== 'all') {
			out.push({
				key: 'assignee',
				label: assignee === 'me' ? 'Mine' : 'Unassigned',
				icon: assignee === 'me' ? UserCircle2 : Users,
				tint: 'bg-primary/10 text-primary ring-primary/20',
				onRemove: () => onClearAssignee?.()
			});
		}
		if (tag !== '') {
			out.push({
				key: 'tag',
				label: `#${tag}`,
				icon: TagIcon,
				tint: 'bg-primary/10 text-primary ring-primary/20',
				onRemove: () => onClearTag?.()
			});
		}
		if (unread) {
			out.push({
				key: 'unread',
				label: 'Unread',
				icon: Sparkles,
				tint: 'bg-primary/10 text-primary ring-primary/20',
				onRemove: () => onClearUnread?.()
			});
		}
		return out;
	});
</script>

{#if chips.length > 0}
	<div
		class="flex flex-wrap items-center gap-1.5 border-t border-border/40 bg-muted/20 px-3 py-2"
		role="group"
		aria-label="Active filters"
	>
		<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
			Active
		</span>
		{#each chips as c (c.key)}
			{@const Icon = c.icon}
			<span
				class={cn(
					'inline-flex h-6 items-center gap-1 rounded-full pl-2 pr-1 text-[11px] font-medium ring-1 ring-inset',
					c.tint
				)}
			>
				<Icon class="h-3 w-3" />
				{c.label}
				<button
					type="button"
					aria-label={`Remove ${c.label} filter`}
					onclick={c.onRemove}
					class="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-150 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<X class="h-2.5 w-2.5" />
				</button>
			</span>
		{/each}
	</div>
{/if}
