<script lang="ts">
	import { Inbox, UserCircle2, Users, Tag as TagIcon, Sparkles, RotateCcw } from '@lucide/svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils/cn';
	import type { AssigneeFilter } from '$lib/stores/inbox.svelte';

	let {
		assignee = $bindable<AssigneeFilter>('all'),
		tag = $bindable<string>(''),
		unread = $bindable<boolean>(false),
		orgTags = [] as string[],
		canViewAll = true,
		showUnread = true,
		onClearAll
	}: {
		assignee?: AssigneeFilter;
		tag?: string;
		unread?: boolean;
		orgTags?: string[];
		canViewAll?: boolean;
		showUnread?: boolean;
		onClearAll?: () => void;
	} = $props();

	type AssigneeOption = { key: AssigneeFilter; label: string; icon: typeof Inbox };
	const ASSIGNEE_OPTIONS: AssigneeOption[] = $derived(
		canViewAll
			? [
					{ key: 'all', label: 'All conversations', icon: Inbox },
					{ key: 'me', label: 'Assigned to me', icon: UserCircle2 },
					{ key: 'unassigned', label: 'Unassigned', icon: Users }
				]
			: [
					{ key: 'all' as AssigneeFilter, label: 'All conversations', icon: Inbox },
					{ key: 'me', label: 'Assigned to me', icon: UserCircle2 }
				]
	);

	const isFiltered = $derived(assignee !== 'all' || tag !== '' || unread);
</script>

<div class="flex flex-col gap-5">
	{#if canViewAll}
		<section class="flex flex-col gap-2">
			<h4 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				Assigned to
			</h4>
			<div role="radiogroup" aria-label="Assignee" class="grid gap-1">
				{#each ASSIGNEE_OPTIONS as opt (opt.key)}
					{@const Icon = opt.icon}
					{@const active = assignee === opt.key}
					<button
						type="button"
						role="radio"
						aria-checked={active}
						onclick={() => (assignee = opt.key)}
						class={cn(
							'flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
						)}
					>
						<span
							class={cn(
								'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
								active ? 'border-primary bg-primary' : 'border-border'
							)}
							aria-hidden="true"
						>
							{#if active}
								<span class="h-1.5 w-1.5 rounded-full bg-primary-foreground"></span>
							{/if}
						</span>
						<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
						<span class="truncate">{opt.label}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if orgTags.length > 0}
		<section class="flex flex-col gap-2">
			<h4 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tag</h4>
			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					onclick={() => (tag = '')}
					class={cn(
						'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150',
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						tag === ''
							? 'border-primary/40 bg-primary/10 text-primary'
							: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
					)}
				>
					Any tag
				</button>
				{#each orgTags as t (t)}
					<button
						type="button"
						onclick={() => (tag = tag === t ? '' : t)}
						class={cn(
							'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							tag === t
								? 'border-primary/40 bg-primary/10 text-primary'
								: 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						<TagIcon class="h-3 w-3" />
						{t}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if showUnread}
		<section class="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
			<div class="flex items-center gap-2.5">
				<Sparkles class="h-4 w-4 text-muted-foreground" />
				<Label for="unread-toggle" class="text-sm font-medium text-foreground">Unread only</Label>
			</div>
			<Switch id="unread-toggle" bind:checked={unread} />
		</section>
	{/if}

	{#if isFiltered && onClearAll}
		<div class="-mt-1 flex justify-end">
			<Button variant="ghost" size="sm" onclick={onClearAll} class="text-muted-foreground">
				<RotateCcw class="h-3.5 w-3.5" />
				Clear filters
			</Button>
		</div>
	{/if}
</div>
