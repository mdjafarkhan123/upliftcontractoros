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

	// Keys that the Pipeline scope radio owns — these are hidden from the regular
	// switch list so the contractor manager makes one All/Mine/None choice instead
	// of juggling two booleans.
	const PIPELINE_SCOPE_KEYS = new Set<string>([
		'can_view_full_pipeline',
		'can_view_assigned_opportunities'
	]);

	type PipelineScope = 'all' | 'mine' | 'none';

	const pipelineScope = $derived<PipelineScope>(
		permissions.can_view_full_pipeline
			? 'all'
			: permissions.can_view_assigned_opportunities
				? 'mine'
				: 'none'
	);

	function setPipelineScope(next: PipelineScope) {
		if (readonly) return;
		permissions.can_view_full_pipeline = next === 'all';
		permissions.can_view_assigned_opportunities = next === 'all' || next === 'mine';
	}

	const SCOPE_OPTIONS: { value: PipelineScope; label: string; description: string }[] = [
		{
			value: 'all',
			label: 'Every opportunity (full pipeline)',
			description:
				'See the entire pipeline including teammates’ deals and total revenue in each stage. Best for owners, sales managers, and office leads.'
		},
		{
			value: 'mine',
			label: 'Only their assigned deals',
			description:
				'See just the opportunities where they are the assignee. Other reps’ cards and stage totals stay hidden. Ideal for salespeople and field techs working their own book.'
		},
		{
			value: 'none',
			label: 'No pipeline access',
			description:
				'The pipeline tab is hidden from their navigation entirely. Use for crew members who never touch deals.'
		}
	];

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
		if (module === 'Pipeline') {
			// Count scope as 1 if anything other than None, plus the action toggles.
			const scopeOn = pipelineScope === 'none' ? 0 : 1;
			const actionsOn = group.permissions
				.filter((p) => !PIPELINE_SCOPE_KEYS.has(p.key))
				.filter((p) => permissions[p.key]).length;
			return scopeOn + actionsOn;
		}
		return group.permissions.filter((p) => permissions[p.key]).length;
	}

	function totalCount(module: string): number {
		const group = PERMISSION_GROUPS.find((g) => g.module === module);
		if (!group) return 0;
		if (module === 'Pipeline') {
			return group.permissions.filter((p) => !PIPELINE_SCOPE_KEYS.has(p.key)).length + 1;
		}
		return group.permissions.length;
	}
</script>

<div class="space-y-2">
	{#each PERMISSION_GROUPS as group (group.module)}
		{@const isOpen = openSections[group.module]}
		{@const active = activeCount(group.module)}
		{@const total = totalCount(group.module)}
		{@const isPipeline = group.module === 'Pipeline'}

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
					{#if isPipeline}
						<fieldset class="space-y-2 py-3">
							<legend class="text-sm font-medium text-foreground"> Pipeline visibility </legend>
							<p class="text-xs text-muted-foreground">
								Pick how much of the pipeline this teammate can see.
							</p>
							<div class="mt-2 space-y-2">
								{#each SCOPE_OPTIONS as opt (opt.value)}
									{@const checked = pipelineScope === opt.value}
									<label
										class={cn(
											'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
											checked
												? 'border-primary bg-primary/5'
												: 'border-border hover:border-border/80 hover:bg-accent/30',
											readonly && 'cursor-default opacity-70'
										)}
									>
										<input
											type="radio"
											name="pipeline-scope"
											value={opt.value}
											{checked}
											disabled={readonly}
											onchange={() => setPipelineScope(opt.value)}
											class="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
										/>
										<div class="min-w-0 flex-1">
											<span class="block text-sm font-medium text-foreground">{opt.label}</span>
											<span class="mt-0.5 block text-xs leading-snug text-muted-foreground">
												{opt.description}
											</span>
										</div>
									</label>
								{/each}
							</div>
						</fieldset>
					{/if}

					{#each group.permissions.filter((p) => !(isPipeline && PIPELINE_SCOPE_KEYS.has(p.key))) as perm (perm.key)}
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
