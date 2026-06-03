<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { Plus, X } from '@lucide/svelte';

	let { data }: { data: { id: string } } = $props();

	type Window = { start: string; end: string };
	type DayState = { day_of_week: number; enabled: boolean; windows: Window[] };

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	let days = $state<DayState[]>(
		Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, enabled: false, windows: [] }))
	);
	let loading = $state(true);
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);

	function toHHMM(t: string): string {
		return t.length >= 5 ? t.slice(0, 5) : t;
	}

	function toMinutes(t: string): number {
		const [h, m] = t.split(':');
		return Number(h) * 60 + Number(m);
	}

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/booking-links/${data.id}`);
			const body = await res.json();
			if (!res.ok) {
				errorMsg = body.error ?? 'Failed to load.';
				return;
			}
			const fresh: DayState[] = Array.from({ length: 7 }, (_, i) => ({
				day_of_week: i,
				enabled: false,
				windows: []
			}));
			for (const w of body.data.windows as Array<{
				day_of_week: number;
				start_time: string;
				end_time: string;
			}>) {
				fresh[w.day_of_week].enabled = true;
				fresh[w.day_of_week].windows.push({ start: toHHMM(w.start_time), end: toHHMM(w.end_time) });
			}
			for (const d of fresh) d.windows.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
			days = fresh;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	function toggleDay(d: DayState) {
		if (d.enabled && d.windows.length === 0) {
			d.windows = [{ start: '08:00', end: '17:00' }];
		}
		if (!d.enabled) {
			d.windows = [];
		}
	}

	function addWindow(d: DayState) {
		d.windows = [...d.windows, { start: '13:00', end: '17:00' }];
	}

	function removeWindow(d: DayState, idx: number) {
		d.windows = d.windows.filter((_, i) => i !== idx);
		if (d.windows.length === 0) d.enabled = false;
	}

	function validate(): string | null {
		for (const d of days) {
			if (!d.enabled) continue;
			if (d.windows.length === 0) {
				return `${DAY_NAMES[d.day_of_week]}: add a time window or mark unavailable.`;
			}
			for (const w of d.windows) {
				if (!w.start || !w.end) return `${DAY_NAMES[d.day_of_week]}: fill in both times.`;
				if (toMinutes(w.end) <= toMinutes(w.start)) {
					return `${DAY_NAMES[d.day_of_week]}: end must be after start.`;
				}
			}
			const sorted = [...d.windows]
				.map((w) => ({ s: toMinutes(w.start), e: toMinutes(w.end) }))
				.sort((a, b) => a.s - b.s);
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].s < sorted[i - 1].e) {
					return `${DAY_NAMES[d.day_of_week]}: windows cannot overlap.`;
				}
			}
		}
		return null;
	}

	async function save() {
		const err = validate();
		if (err) {
			toast.error(err);
			return;
		}
		saving = true;
		try {
			const windows = days.flatMap((d) =>
				d.enabled
					? d.windows.map((w) => ({
							day_of_week: d.day_of_week,
							start_time: w.start,
							end_time: w.end
						}))
					: []
			);
			const res = await fetch(`/api/booking-links/${data.id}/availability/windows`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ windows })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to save.');
				return;
			}
			toast.success('Availability saved');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Availability</title></svelte:head>

{#if loading}
	<SkeletonLoader lines={7} height="80px" label="Loading availability" />
{:else if errorMsg}
	<p class="text-sm text-destructive">{errorMsg}</p>
{:else}
	<div class="space-y-3">
		{#each days as d (d.day_of_week)}
			<div class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-sm font-semibold text-foreground">{DAY_NAMES[d.day_of_week]}</p>
						<p class="text-xs text-muted-foreground">
							{d.enabled ? 'Available' : 'Unavailable'}
						</p>
					</div>
					<Switch
						checked={d.enabled}
						onCheckedChange={(v: boolean) => {
							d.enabled = v;
							toggleDay(d);
						}}
					/>
				</div>

				{#if d.enabled}
					<div class="mt-4 space-y-2">
						{#each d.windows as w, i (i)}
							<div class="flex items-center gap-2">
								<input
									type="time"
									bind:value={w.start}
									class="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
								/>
								<span class="text-sm text-muted-foreground">–</span>
								<input
									type="time"
									bind:value={w.end}
									class="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-11 w-11"
									onclick={() => removeWindow(d, i)}
									aria-label="Remove window"
								>
									<X class="h-4 w-4" />
								</Button>
							</div>
						{/each}
						<Button type="button" variant="outline" size="sm" onclick={() => addWindow(d)}>
							<Plus class="h-3.5 w-3.5" /> Add window
						</Button>
					</div>
				{/if}
			</div>
		{/each}

		<div class="flex justify-end gap-2 pt-2">
			<JetEngineButton
				label="Save availability"
				loadingLabel="Saving…"
				successLabel="Saved"
				state={saving ? 'loading' : 'idle'}
				onclick={save}
			/>
		</div>
	</div>
{/if}
