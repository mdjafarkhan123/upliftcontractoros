<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import { sessionStore } from '$lib/stores/session.svelte';
	import {
		STATUS_CLEAR_OPTIONS,
		effectiveStatus,
		type MemberNotificationStatus,
		type StatusClearAfter
	} from '$lib/notifications/memberStatus';
	import { MEMBER_STATUS_PRESETS } from '$lib/notifications/memberStatusPresets';
	import type { OrgMember } from '$lib/types';

	let { member }: { member: OrgMember } = $props();

	// Honor expiry so the checkmark sits on what's actually in effect right now.
	const current = $derived(
		effectiveStatus(member.notification_status, member.notification_status_expires_at)
	);

	let clearAfter = $state<StatusClearAfter>('none');
	let saving = $state<MemberNotificationStatus | null>(null);

	async function setStatus(status: MemberNotificationStatus) {
		if (saving) return;
		saving = status;
		try {
			const res = await fetch('/api/me/status', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status,
					clear_after: status === 'in_office' ? 'none' : clearAfter
				})
			});
			if (!res.ok) throw new Error('failed');
			const body = (await res.json()) as {
				data: {
					notification_status: MemberNotificationStatus;
					notification_status_expires_at: string | null;
				};
			};

			// Optimistically reflect in the session store so routing + every avatar
			// dot update without a reload.
			const data = sessionStore.data;
			if (data) {
				sessionStore.update({
					...data,
					member: {
						...data.member,
						notification_status: body.data.notification_status,
						notification_status_expires_at: body.data.notification_status_expires_at
							? new Date(body.data.notification_status_expires_at)
							: null
					}
				});
			}

			const preset = MEMBER_STATUS_PRESETS.find((p) => p.value === status);
			toast.success(`Status set to ${preset?.label ?? status}`);
			clearAfter = 'none';
		} catch {
			toast.error('Could not update status');
		} finally {
			saving = null;
		}
	}
</script>

<div class="status-menu">
	<p class="status-menu__heading">My status</p>
	<div class="status-menu__list">
		{#each MEMBER_STATUS_PRESETS as preset (preset.value)}
			{@const active = current === preset.value}
			<button
				type="button"
				onclick={() => setStatus(preset.value)}
				disabled={saving !== null}
				aria-pressed={active}
				class="status-menu__option"
				class:status-menu__option--active={active}
				class:status-menu__option--busy={saving !== null}
			>
				<span class="status-menu__dot" style="background: {preset.dotColor}"></span>
				<i
					class="{preset.iconClass} status-menu__icon"
					style="color: {preset.textColor}"
					aria-hidden="true"
				></i>
				<span class="status-menu__label">{preset.label}</span>
				{#if active}
					<i class="ri-check-line status-menu__check" aria-hidden="true"></i>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Auto-revert window. Applies to the next status you pick (ignored for In office). -->
	<div class="status-menu__clear">
		<p class="status-menu__clear-label">Clear after</p>
		<div class="status-menu__chips">
			{#each STATUS_CLEAR_OPTIONS as opt (opt.value)}
				<button
					type="button"
					onclick={() => (clearAfter = opt.value)}
					aria-pressed={clearAfter === opt.value}
					class="status-menu__chip"
					class:status-menu__chip--active={clearAfter === opt.value}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.status-menu {
		padding: $space-2;

		&__heading {
			margin: 0;
			padding: 0 $space-2 6px;
			font-size: $fs-caption;
			font-weight: $weight-medium;
			letter-spacing: $tracking-label;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		&__list {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		&__option {
			display: flex;
			align-items: center;
			gap: 10px;
			min-height: 40px;
			width: 100%;
			padding: 6px $space-2;
			border: none;
			border-radius: $radius-md;
			background: transparent;
			text-align: left;
			cursor: pointer;
			transition: background-color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}
			&--active {
				background: var(--state-active-tint);
			}
			&--busy {
				opacity: 0.7;
			}
		}

		&__dot {
			width: 8px;
			height: 8px;
			flex-shrink: 0;
			border-radius: $radius-full;
		}

		&__icon {
			flex-shrink: 0;
			font-size: 16px;
		}

		&__label {
			min-width: 0;
			flex: 1;
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-primary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&__check {
			flex-shrink: 0;
			font-size: 16px;
			color: var(--color-brand);
		}

		&__clear {
			margin-top: $space-2;
			padding-top: $space-2;
			border-top: 1px solid var(--color-border);
		}

		&__clear-label {
			margin: 0;
			padding: 0 $space-2 6px;
			font-size: $fs-caption;
			color: var(--color-text-muted);
		}

		&__chips {
			display: flex;
			flex-wrap: wrap;
			gap: $space-1;
			padding: 0 $space-1;
		}

		&__chip {
			padding: $space-1 $space-2;
			border: 1px solid var(--color-border);
			border-radius: $radius-md;
			background: transparent;
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
			cursor: pointer;
			transition:
				background-color $duration-fast $ease-standard,
				color $duration-fast $ease-standard,
				border-color $duration-fast $ease-standard;

			&:hover {
				background: var(--color-bg-surface-sunk);
			}
			&--active {
				border-color: var(--color-brand);
				background: var(--state-active-tint);
				color: var(--color-brand);
			}
		}
	}
</style>
