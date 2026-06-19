<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
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

<div class="px-2 py-2">
	<p class="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
		My status
	</p>
	<div class="flex flex-col gap-0.5">
		{#each MEMBER_STATUS_PRESETS as preset (preset.value)}
			{@const Icon = preset.icon}
			{@const active = current === preset.value}
			<button
				type="button"
				onclick={() => setStatus(preset.value)}
				disabled={saving !== null}
				aria-pressed={active}
				class={cn(
					'flex min-h-[40px] w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
					active ? 'bg-accent' : 'hover:bg-accent/60',
					saving !== null && 'opacity-70'
				)}
			>
				<span class={cn('h-2 w-2 shrink-0 rounded-full', preset.dotClass)}></span>
				<Icon class={cn('h-4 w-4 shrink-0', preset.textClass)} />
				<span class="min-w-0 flex-1 truncate font-medium text-foreground">{preset.label}</span>
				{#if active}
					<Check class="h-4 w-4 shrink-0 text-primary" />
				{/if}
			</button>
		{/each}
	</div>

	<!-- Auto-revert window. Applies to the next status you pick (ignored for In office). -->
	<div class="mt-2 border-t border-border/50 pt-2">
		<p class="px-2 pb-1.5 text-[11px] text-muted-foreground">Clear after</p>
		<div class="flex flex-wrap gap-1 px-1">
			{#each STATUS_CLEAR_OPTIONS as opt (opt.value)}
				<button
					type="button"
					onclick={() => (clearAfter = opt.value)}
					aria-pressed={clearAfter === opt.value}
					class={cn(
						'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
						clearAfter === opt.value
							? 'border-primary/40 bg-primary/10 text-primary'
							: 'border-border/60 text-muted-foreground hover:bg-accent/60'
					)}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</div>
</div>
