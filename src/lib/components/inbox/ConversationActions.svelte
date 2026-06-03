<script lang="ts">
	import {
		CheckCircle2,
		RotateCcw,
		MoreHorizontal,
		UserPlus,
		UserMinus,
		Tag,
		X
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
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

<div class="flex items-center gap-1.5">
	{#if !isClosed}
		<SnoozeMenu {isSnoozed} disabled={!canManage} {onSnooze} {onUnsnooze} />
	{/if}

	{#if isClosed}
		<Button
			variant="ghost"
			size="sm"
			disabled={!canManage}
			class="min-h-[36px] gap-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => void onReopen()}
		>
			<RotateCcw class="h-4 w-4" />
			Reopen
		</Button>
	{:else}
		<Button
			variant="ghost"
			size="sm"
			disabled={!canManage}
			class="min-h-[36px] gap-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => void onClose()}
		>
			<CheckCircle2 class="h-4 w-4" />
			Close
		</Button>
	{/if}

	{#if onUpdateTags}
		<Button
			variant="ghost"
			size="sm"
			disabled={!canManage}
			class="min-h-[36px] gap-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={() => (tagPanelOpen = !tagPanelOpen)}
		>
			<Tag class="h-4 w-4" />
			Tags
			{#if currentTags.length > 0}
				<span
					class="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary"
					>{currentTags.length}</span
				>
			{/if}
		</Button>
	{/if}

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon"
					aria-label="More actions"
					class="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<MoreHorizontal class="h-4 w-4" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-56">
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
						<UserPlus class="mr-2 h-4 w-4" />
						Assign to me
					</DropdownMenu.Item>
				{/if}
				{#each assignees.filter((a) => a.id !== currentMemberId) as a (a.id)}
					<DropdownMenu.Item onclick={() => void onAssign(a.id, a.full_name)}>
						{a.full_name}
						{#if a.id === assignedTo}
							<span class="ml-auto text-xs text-muted-foreground">Current</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
				{#if assignedTo}
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={() => void onAssign(null, null)}>
						<UserMinus class="mr-2 h-4 w-4" />
						Unassign
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

{#if onUpdateTags && tagPanelOpen}
	<div class="mt-2 rounded-xl border border-border/60 bg-card p-3 shadow-card">
		<div class="flex flex-wrap items-center gap-1.5">
			{#each currentTags as t (t)}
				<span
					class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
				>
					#{t}
					<button
						type="button"
						aria-label={`Remove ${t}`}
						class="rounded-full p-0.5 hover:bg-primary/20"
						disabled={!canManage}
						onclick={() => removeTag(t)}
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}
			{#if currentTags.length < 5}
				<Input
					type="text"
					value={tagInput}
					oninput={(e) => (tagInput = (e.currentTarget as HTMLInputElement).value)}
					onkeydown={onTagKey}
					placeholder="Add tag…"
					disabled={!canManage}
					class="h-7 w-32 rounded-full border-border/60 bg-background px-3 text-xs shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/20"
				/>
			{/if}
		</div>
		{#if suggestions.length > 0 && currentTags.length < 5}
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each suggestions as s (s)}
					<button
						type="button"
						class="inline-flex h-6 items-center rounded-full border border-border/60 bg-background px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
						onclick={() => addTag(s)}
					>
						#{s}
					</button>
				{/each}
			</div>
		{/if}
		<p class="mt-2 text-[10px] text-muted-foreground">Max 5 tags. Press Enter or comma to add.</p>
	</div>
{/if}
