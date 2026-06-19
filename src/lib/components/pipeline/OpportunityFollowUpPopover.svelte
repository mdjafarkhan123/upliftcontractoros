<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { DateTimePicker } from '$lib/components/ui/date-time-picker';
	import { getOrgContext } from '$lib/context/org';
	import { toast } from '$lib/stores/toast.svelte';
	import { fromZonedTime } from 'date-fns-tz';
	import { CalendarClock } from '@lucide/svelte';
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
	let customValue = $state(''); // local datetime string from DateTimePicker

	function pad(n: number): string {
		return n.toString().padStart(2, '0');
	}

	// Build a "YYYY-MM-DDTHH:mm" wall-clock string in the org TZ, then convert it to
	// the correct UTC instant with fromZonedTime(). Mirrors the contact popover.
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
		class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
	>
		<CalendarClock class="h-4 w-4" />
		{currentValue ? formatDateTime(currentValue) : 'Set follow-up'}
	</Popover.Trigger>
	<Popover.Content class="w-72 space-y-2" align="end">
		{#if mode === 'presets'}
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Set follow-up</p>
			{#if currentValue}
				<p class="text-xs text-muted-foreground">Currently: {formatDateTime(currentValue)}</p>
			{/if}
			<div class="grid gap-1.5">
				<Button
					variant="outline"
					class="h-10 justify-start"
					disabled={saving}
					onclick={() => patch(presetIso(1, 9))}
				>
					Tomorrow · 9:00 AM
				</Button>
				<Button
					variant="outline"
					class="h-10 justify-start"
					disabled={saving}
					onclick={() => patch(presetIso(3, 9))}
				>
					In 3 days · 9:00 AM
				</Button>
				<Button
					variant="outline"
					class="h-10 justify-start"
					disabled={saving}
					onclick={() => patch(presetIso(0, 9, 1))}
				>
					Next Monday · 9:00 AM
				</Button>
				<Button
					variant="ghost"
					class="h-10 justify-start"
					disabled={saving}
					onclick={() => (mode = 'custom')}
				>
					Custom…
				</Button>
				{#if currentValue}
					<Button
						variant="ghost"
						class="h-10 justify-start text-destructive hover:text-destructive"
						disabled={saving}
						onclick={() => patch(null)}
					>
						Clear follow-up
					</Button>
				{/if}
			</div>
			<p class="pt-1 text-[11px] leading-snug text-muted-foreground">
				Times in {tz}. We'll remind the assigned member (or a manager) when it's due.
			</p>
		{:else}
			<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Custom follow-up
			</p>
			<DateTimePicker bind:value={customValue} placeholder="Pick date & time" />
			<div class="flex justify-between gap-2 pt-1">
				<Button
					variant="ghost"
					class="h-10"
					disabled={saving}
					onclick={() => {
						mode = 'presets';
						customValue = '';
					}}
				>
					Back
				</Button>
				<Button class="h-10" disabled={saving || !customValue} onclick={applyCustom}>
					{saving ? 'Saving…' : 'Set follow-up'}
				</Button>
			</div>
			<p class="pt-1 text-[11px] leading-snug text-muted-foreground">
				Time will be saved in {tz}.
			</p>
		{/if}
	</Popover.Content>
</Popover.Root>
