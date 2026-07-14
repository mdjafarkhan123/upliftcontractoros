<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { getOrgContext } from '$lib/context/org';
	import { toast } from '$lib/stores/toast.svelte';
	import { fromZonedTime } from 'date-fns-tz';
	import { formatDateTime } from '$lib/utils/format';

	let {
		opportunityId,
		currentValue,
		disabled = false,
		open = $bindable(false),
		onUpdated
	}: {
		opportunityId: string;
		currentValue: string | null;
		disabled?: boolean;
		open?: boolean;
		onUpdated: (iso: string | null) => void;
	} = $props();

	const org = getOrgContext();
	const tz = $derived(org().timezone || 'UTC');
	let saving = $state(false);
	let mode = $state<'presets' | 'custom'>('presets');
	let customValue = $state('');

	function pad(n: number): string {
		return n.toString().padStart(2, '0');
	}

	function presetIso(daysAhead: number, hour: number, dayOfWeek?: number): string {
		const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
		const target = new Date(nowInTz);
		target.setHours(hour, 0, 0, 0);

		if (dayOfWeek !== undefined) {
			const current = target.getDay();
			let delta = (dayOfWeek - current + 7) % 7;
			if (delta === 0 && nowInTz.getTime() >= target.getTime()) delta = 7;
			target.setDate(target.getDate() + delta);
		} else {
			target.setDate(target.getDate() + daysAhead);
		}

		const wall = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(hour)}:00`;
		return fromZonedTime(wall, tz).toISOString();
	}

	async function patch(iso: string | null) {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/pipeline/opportunities/${opportunityId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ next_follow_up_at: iso })
			});
			if (res.ok) {
				onUpdated(iso);
				toast.success(iso ? 'Follow-up set' : 'Follow-up cleared');
				open = false;
				mode = 'presets';
				customValue = '';
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to set follow-up');
			}
		} finally {
			saving = false;
		}
	}

	async function applyCustom() {
		if (!customValue) return;
		const iso = fromZonedTime(customValue, tz).toISOString();
		await patch(iso);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{disabled}
		class="follow-up-popover__trigger"
	>
		<i class="ri-calendar-schedule-line" aria-hidden="true"></i>
		{currentValue ? formatDateTime(currentValue) : 'Set follow-up'}
	</Popover.Trigger>
	<Popover.Content style="width:288px;" align="end">
		{#if mode === 'presets'}
			<p class="follow-up-popover__label">Set follow-up</p>
			{#if currentValue}
				<p class="follow-up-popover__current">Currently: {formatDateTime(currentValue)}</p>
			{/if}
			<div class="follow-up-popover__presets">
				<Button
					variant="outline"
					style="height:40px; justify-content:flex-start;"
					disabled={saving}
					onclick={() => patch(presetIso(1, 9))}
				>
					Tomorrow · 9:00 AM
				</Button>
				<Button
					variant="outline"
					style="height:40px; justify-content:flex-start;"
					disabled={saving}
					onclick={() => patch(presetIso(3, 9))}
				>
					In 3 days · 9:00 AM
				</Button>
				<Button
					variant="outline"
					style="height:40px; justify-content:flex-start;"
					disabled={saving}
					onclick={() => patch(presetIso(0, 9, 1))}
				>
					Next Monday · 9:00 AM
				</Button>
				<Button
					variant="ghost"
					style="height:40px; justify-content:flex-start;"
					disabled={saving}
					onclick={() => (mode = 'custom')}
				>
					Custom…
				</Button>
				{#if currentValue}
					<Button
						variant="ghost"
						style="height:40px; justify-content:flex-start; color:var(--danger-solid);"
						disabled={saving}
						onclick={() => patch(null)}
					>
						Clear follow-up
					</Button>
				{/if}
			</div>
			<p class="follow-up-popover__tz-note">
				Times in {tz}. We'll remind the assigned member (or a manager) when it's due.
			</p>
		{:else}
			<p class="follow-up-popover__label">Custom follow-up</p>
			<DateTimePicker bind:value={customValue} placeholder="Pick date & time" />
			<div class="follow-up-popover__custom-actions">
				<Button
					variant="ghost"
					style="height:40px;"
					disabled={saving}
					onclick={() => {
						mode = 'presets';
						customValue = '';
					}}
				>
					Back
				</Button>
				<Button style="height:40px;" disabled={saving || !customValue} onclick={applyCustom}>
					{saving ? 'Saving…' : 'Set follow-up'}
				</Button>
			</div>
			<p class="follow-up-popover__tz-note">Time will be saved in {tz}.</p>
		{/if}
	</Popover.Content>
</Popover.Root>
