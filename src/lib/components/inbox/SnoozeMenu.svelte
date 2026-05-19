<script lang="ts">
	import { Clock } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import type { SnoozePreset } from '$lib/stores/inbox.svelte';

	let {
		onSnooze,
		onUnsnooze,
		isSnoozed = false,
		disabled = false
	}: {
		onSnooze: (preset: SnoozePreset) => Promise<void> | void;
		onUnsnooze?: () => Promise<void> | void;
		isSnoozed?: boolean;
		disabled?: boolean;
	} = $props();

	const PRESETS: Array<{ key: SnoozePreset; label: string; hint: string }> = [
		{ key: '1h', label: 'In 1 hour', hint: '' },
		{ key: '3h', label: 'In 3 hours', hint: '' },
		{ key: 'tomorrow_9am', label: 'Tomorrow', hint: '9:00 AM' },
		{ key: 'next_week', label: 'Next week', hint: 'Mon 9:00 AM' }
	];
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				disabled={disabled}
				class="min-h-[36px] gap-1.5"
			>
				<Clock class="h-4 w-4" />
				{isSnoozed ? 'Snoozed' : 'Snooze'}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-48">
		<DropdownMenu.Label>Snooze until</DropdownMenu.Label>
		<DropdownMenu.Separator />
		{#each PRESETS as preset (preset.key)}
			<DropdownMenu.Item onclick={() => void onSnooze(preset.key)}>
				<div class="flex w-full items-center justify-between">
					<span>{preset.label}</span>
					{#if preset.hint}
						<span class="text-xs text-muted-foreground">{preset.hint}</span>
					{/if}
				</div>
			</DropdownMenu.Item>
		{/each}
		{#if isSnoozed && onUnsnooze}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={() => void onUnsnooze()}>Unsnooze now</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
