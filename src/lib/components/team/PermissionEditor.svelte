<script lang="ts">
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

<div class="perm-editor">
	{#each PERMISSION_GROUPS as group (group.module)}
		{@const isOpen = openSections[group.module]}
		{@const active = activeCount(group.module)}
		{@const total = totalCount(group.module)}
		{@const isPipeline = group.module === 'Pipeline'}

		<div class="perm-editor__group">
			<button type="button" class="perm-editor__head" onclick={() => toggleSection(group.module)}>
				<span class="perm-editor__head-main">
					<span class="perm-editor__module">{group.module}</span>
					<span class="perm-editor__count">{active}/{total}</span>
				</span>
				<i
					class="perm-editor__chevron ri-arrow-down-s-line"
					class:perm-editor__chevron--open={isOpen}
					aria-hidden="true"
				></i>
			</button>

			{#if isOpen}
				<div class="perm-editor__body">
					{#if isPipeline}
						<fieldset class="perm-editor__scope">
							<legend class="perm-editor__scope-legend">Pipeline visibility</legend>
							<p class="perm-editor__scope-hint">
								Pick how much of the pipeline this teammate can see.
							</p>
							<div class="perm-editor__scope-list">
								{#each SCOPE_OPTIONS as opt (opt.value)}
									{@const checked = pipelineScope === opt.value}
									<label
										class="perm-editor__scope-opt"
										class:perm-editor__scope-opt--selected={checked}
										class:perm-editor__scope-opt--readonly={readonly}
									>
										<input
											type="radio"
											name="pipeline-scope"
											value={opt.value}
											{checked}
											disabled={readonly}
											onchange={() => setPipelineScope(opt.value)}
										/>
										<span class="perm-editor__scope-text">
											<span class="perm-editor__scope-label">{opt.label}</span>
											<span class="perm-editor__scope-desc">{opt.description}</span>
										</span>
									</label>
								{/each}
							</div>
						</fieldset>
					{/if}

					{#each group.permissions.filter((p) => !(isPipeline && PIPELINE_SCOPE_KEYS.has(p.key))) as perm (perm.key)}
						<div class="perm-editor__row">
							<div class="perm-editor__row-text">
								<label class="perm-editor__row-label" for={`perm-${perm.key}`}>{perm.label}</label>
								<p class="perm-editor__row-desc">{perm.description}</p>
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
