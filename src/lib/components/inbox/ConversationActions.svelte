<script lang="ts">
	import { CheckCircle2, RotateCcw, MoreHorizontal, UserPlus, UserMinus } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import SnoozeMenu from './SnoozeMenu.svelte';
	import type { ConversationDetail, SnoozePreset } from '$lib/stores/inbox.svelte';

	type AssigneeOption = { id: string; full_name: string };

	let {
		conversation,
		canManage = true,
		assignees = [],
		currentMemberId,
		onSnooze,
		onUnsnooze,
		onClose,
		onReopen,
		onAssign
	}: {
		conversation: ConversationDetail | null;
		canManage?: boolean;
		assignees?: AssigneeOption[];
		currentMemberId?: string;
		onSnooze: (preset: SnoozePreset) => Promise<void> | void;
		onUnsnooze: () => Promise<void> | void;
		onClose: () => Promise<void> | void;
		onReopen: () => Promise<void> | void;
		onAssign: (memberId: string | null, name: string | null) => Promise<void> | void;
	} = $props();

	const status = $derived(conversation?.status ?? 'open');
	const isSnoozed = $derived(status === 'snoozed');
	const isClosed = $derived(status === 'closed');
	const assignedTo = $derived(conversation?.assigned_to ?? null);
</script>

<div class="flex items-center gap-1.5">
	{#if !isClosed}
		<SnoozeMenu
			isSnoozed={isSnoozed}
			disabled={!canManage}
			{onSnooze}
			{onUnsnooze}
		/>
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
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
