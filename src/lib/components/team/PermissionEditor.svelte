<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import { Switch } from '$lib/components/ui/switch';
	import { PERMISSION_GROUPS } from '$lib/team/permissions-config';
	import type { PermissionValues } from '$lib/team/permissions-config';

	let {
		permissions = $bindable(),
		readonly = false
	}: {
		permissions: PermissionValues;
		readonly?: boolean;
	} = $props();

	// Accordion open state persists during the editing session
	let openSections = $state<Record<string, boolean>>(
		Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.module, true]))
	);

	function toggleSection(module: string) {
		openSections[module] = !openSections[module];
	}

	function activeCount(module: string): number {
		const group = PERMISSION_GROUPS.find((g) => g.module === module);
		if (!group) return 0;
		return group.permissions.filter((p) => permissions[p.key]).length;
	}
</script>

<div class="space-y-2">
	{#each PERMISSION_GROUPS as group (group.module)}
		{@const isOpen = openSections[group.module]}
		{@const active = activeCount(group.module)}
		{@const total = group.permissions.length}

		<div class="overflow-hidden rounded-xl border border-border bg-card">
			<button
				type="button"
				onclick={() => toggleSection(group.module)}
				class="flex w-full min-h-[52px] items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<div class="flex items-center gap-2">
					<span class="text-sm font-semibold text-foreground">{group.module}</span>
					<span class="text-xs text-muted-foreground">{active}/{total}</span>
				</div>
				<ChevronDown
					class={cn(
						'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
						isOpen && 'rotate-180'
					)}
				/>
			</button>

			{#if isOpen}
				<div class="border-t border-border/50 px-4 py-2">
					{#each group.permissions as perm (perm.key)}
						<div class="flex min-h-[52px] items-center justify-between gap-4 py-2">
							<div class="flex-1 min-w-0">
								<label
									for={`perm-${perm.key}`}
									class={cn(
										'block text-sm font-medium text-foreground leading-tight',
										readonly ? 'cursor-default' : 'cursor-pointer'
									)}
								>
									{perm.label}
								</label>
								<p class="text-xs text-muted-foreground mt-0.5">{perm.description}</p>
							</div>
							<Switch
								id={`perm-${perm.key}`}
								bind:checked={permissions[perm.key]}
								disabled={readonly}
							/>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
