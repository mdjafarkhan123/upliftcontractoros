<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
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
			<button {...props} type="button" class="convo-actions__btn" {disabled}>
				<i class="ri-time-line" aria-hidden="true"></i>
				{isSnoozed ? 'Snoozed' : 'Snooze'}
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-48">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Snooze until</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#each PRESETS as preset (preset.key)}
				<DropdownMenu.Item onclick={() => void onSnooze(preset.key)}>
					<div class="snooze-menu__row">
						<span>{preset.label}</span>
						{#if preset.hint}
							<span class="snooze-menu__hint">{preset.hint}</span>
						{/if}
					</div>
				</DropdownMenu.Item>
			{/each}
			{#if isSnoozed && onUnsnooze}
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => void onUnsnooze()}>Unsnooze now</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
