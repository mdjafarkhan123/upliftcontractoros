<script lang="ts">
	import {
		PERMISSION_GROUPS,
		fullAdminPermissions,
		emptyPermissions
	} from '$lib/permissions/permissions-matrix';
	import type { PermissionKey } from '$lib/types';

	let {
		permissions = $bindable<Record<PermissionKey, boolean>>()
	}: {
		permissions?: Record<PermissionKey, boolean>;
	} = $props();

	function applyFull() {
		permissions = fullAdminPermissions();
	}

	function applyEmpty() {
		permissions = emptyPermissions();
	}

	function groupCounts(groupId: string) {
		const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
		if (!group) return { on: 0, total: 0 };
		const on = group.permissions.filter((p) => permissions[p.key]).length;
		return { on, total: group.permissions.length };
	}

	function toggleGroup(groupId: string, value: boolean) {
		const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
		if (!group) return;
		for (const p of group.permissions) {
			permissions[p.key] = value;
		}
	}
</script>

<div class="space-y-4">
	<div
		class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
	>
		<div>
			<p class="text-xs font-semibold text-slate-300">Permission templates</p>
			<p class="mt-0.5 text-[11px] text-slate-500">
				Starts with Full Admin pre-applied. Untick anything before saving.
			</p>
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={applyFull}
				class="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors cursor-pointer"
			>
				Full Admin
			</button>
			<button
				type="button"
				onclick={applyEmpty}
				class="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors cursor-pointer"
			>
				Clear all
			</button>
		</div>
	</div>

	{#each PERMISSION_GROUPS as group (group.id)}
		{@const counts = groupCounts(group.id)}
		{@const allOn = counts.on === counts.total}
		<div class="rounded-xl border border-slate-800 bg-slate-950/40">
			<header
				class="flex items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3"
			>
				<div>
					<h3 class="text-sm font-semibold text-white">{group.title}</h3>
					<p class="mt-0.5 text-[11px] text-slate-500">
						{counts.on} / {counts.total} enabled
					</p>
				</div>
				<button
					type="button"
					onclick={() => toggleGroup(group.id, !allOn)}
					class="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-800 transition-colors cursor-pointer"
				>
					{allOn ? 'Clear group' : 'Select group'}
				</button>
			</header>

			<ul class="divide-y divide-slate-800/60">
				{#each group.permissions as perm (perm.key)}
					<li class="flex items-start gap-3 px-4 py-3">
						<input
							id={`perm-${perm.key}`}
							type="checkbox"
							bind:checked={permissions[perm.key]}
							class="mt-1 size-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-950 text-red-500 focus:ring-2 focus:ring-red-500/40 focus:ring-offset-0"
						/>
						<label for={`perm-${perm.key}`} class="min-w-0 flex-1 cursor-pointer">
							<span class="block text-sm font-medium text-white">{perm.label}</span>
							<span class="mt-0.5 block text-[11px] leading-snug text-slate-500">
								{perm.description}
							</span>
						</label>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
