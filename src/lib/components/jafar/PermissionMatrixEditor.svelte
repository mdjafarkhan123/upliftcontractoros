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

<div class="jafar-perm">
	<div class="jafar-perm__tpl">
		<div>
			<p class="jafar-perm__tpl-label">Permission templates</p>
			<p class="jafar-perm__tpl-sub">
				Starts with Full Admin pre-applied. Untick anything before saving.
			</p>
		</div>
		<div class="jafar-perm__tpl-btns">
			<button type="button" onclick={applyFull} class="jafar-btn jafar-btn--sm">Full Admin</button>
			<button type="button" onclick={applyEmpty} class="jafar-btn jafar-btn--sm">Clear all</button>
		</div>
	</div>

	{#each PERMISSION_GROUPS as group (group.id)}
		{@const counts = groupCounts(group.id)}
		{@const allOn = counts.on === counts.total}
		<div class="jafar-perm-group">
			<header class="jafar-perm-group__head">
				<div>
					<h3 class="jafar-perm-group__title">{group.title}</h3>
					<p class="jafar-perm-group__counts">{counts.on} / {counts.total} enabled</p>
				</div>
				<button
					type="button"
					onclick={() => toggleGroup(group.id, !allOn)}
					class="jafar-btn jafar-btn--sm"
				>
					{allOn ? 'Clear group' : 'Select group'}
				</button>
			</header>

			<ul class="jafar-perm-group__list">
				{#each group.permissions as perm (perm.key)}
					<li class="jafar-perm-row">
						<label for={`perm-${perm.key}`} class="jafar-perm-row__label">
							<span class="perm-name">{perm.label}</span>
							<span class="perm-desc">{perm.description}</span>
						</label>
						<input
							id={`perm-${perm.key}`}
							type="checkbox"
							bind:checked={permissions[perm.key]}
							class="perm-check"
						/>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>

<style lang="scss">
	.perm-name {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: #fff;
	}

	.perm-desc {
		display: block;
		margin-top: 0.125rem;
		font-size: 0.6875rem;
		line-height: 1.4;
		color: #64748b;
	}

	.perm-check {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		margin-top: 0.125rem;
		cursor: pointer;
		border-radius: 0.25rem;
		accent-color: #ef4444;
	}
</style>
