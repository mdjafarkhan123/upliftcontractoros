<script lang="ts">
	import { onMount } from 'svelte';

	type ControlState = {
		floor: number;
		balance: number | null;
		balanceAt: string | null;
		currency: string | null;
		paused: boolean;
		pausedAt: string | null;
		pausedReason: string | null;
		waitingCount: number;
		delayedCount: number;
	};

	let status = $state<'loading' | 'loaded' | 'error'>('loading');
	let data = $state<ControlState | null>(null);
	let loadError = $state('');
	let floorInput = $state('');
	let actionError = $state('');
	let busy = $state<'floor' | 'pause' | 'resume' | 'refresh' | null>(null);

	const ccy = $derived(data?.currency ?? 'USD');

	function fmtMoney(n: number | null): string {
		if (n === null) return '—';
		return `${ccy} ${n.toFixed(2)}`;
	}

	function fmtWhen(iso: string | null): string {
		if (!iso) return 'never';
		const d = new Date(iso);
		const mins = Math.round((Date.now() - d.getTime()) / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		return d.toLocaleDateString();
	}

	function apply(state: ControlState) {
		data = state;
		floorInput = state.floor.toString();
	}

	async function load() {
		status = 'loading';
		loadError = '';
		try {
			const res = await fetch('/api/admin/sms-master');
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Failed to load SMS controls');
			apply(body.data);
			status = 'loaded';
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load SMS controls';
			status = 'error';
		}
	}

	async function saveFloor() {
		const value = Number(floorInput);
		if (!Number.isFinite(value) || value < 0) {
			actionError = 'Floor must be zero or positive.';
			return;
		}
		busy = 'floor';
		actionError = '';
		try {
			const res = await fetch('/api/admin/sms-master', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sms_master_floor: value })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? 'Failed to save floor');
			apply(body.data);
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Failed to save floor';
		} finally {
			busy = null;
		}
	}

	async function doAction(action: 'pause' | 'resume' | 'refresh') {
		busy = action;
		actionError = '';
		try {
			const res = await fetch('/api/admin/sms-master', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? `Failed to ${action}`);
			apply(body.data);
		} catch (e) {
			actionError = e instanceof Error ? e.message : `Failed to ${action}`;
		} finally {
			busy = null;
		}
	}

	onMount(load);
</script>

<section
	class="rounded-2xl border border-slate-800 bg-slate-900/50 shadow-xl shadow-black/30 overflow-hidden"
>
	<header class="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
		<div>
			<h2 class="text-base font-semibold text-white">SMS Master Balance</h2>
			<p class="mt-0.5 text-xs text-slate-500">
				Platform-wide Twilio safety floor &amp; kill switch
			</p>
		</div>
		<button
			type="button"
			onclick={() => doAction('refresh')}
			disabled={busy !== null || status !== 'loaded'}
			class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
		>
			{busy === 'refresh' ? 'Refreshing…' : 'Refresh balance'}
		</button>
	</header>

	{#if status === 'loading'}
		<div class="px-5 py-10 text-center text-sm text-slate-400">Loading SMS controls…</div>
	{:else if status === 'error'}
		<div class="px-5 py-8 text-center">
			<p class="text-sm font-semibold text-red-200">{loadError}</p>
			<button
				type="button"
				onclick={load}
				class="mt-3 inline-flex h-9 items-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 text-xs font-semibold text-red-100 hover:bg-red-500/20 transition-colors cursor-pointer"
			>
				Retry
			</button>
		</div>
	{:else if data}
		<div class="space-y-5 px-5 py-5">
			<!-- Paused / active status banner -->
			{#if data.paused}
				<div class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p class="text-sm font-semibold text-red-200">SMS sending is PAUSED</p>
							<p class="mt-0.5 text-xs text-red-300/80">
								{data.pausedReason ?? 'Outbound SMS is paused.'}
								{#if data.pausedAt}<span class="text-red-300/60">
										· {fmtWhen(data.pausedAt)}</span
									>{/if}
							</p>
							<p class="mt-1 text-xs text-red-300/70">
								{data.waitingCount} waiting · {data.delayedCount} delayed in queue — they resume on restart.
							</p>
						</div>
						<button
							type="button"
							onclick={() => doAction('resume')}
							disabled={busy !== null}
							class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-900/40 hover:from-emerald-500 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer"
						>
							{busy === 'resume' ? 'Resuming…' : 'Resume SMS'}
						</button>
					</div>
				</div>
			{:else}
				<div
					class="flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<p class="text-sm font-semibold text-emerald-200">SMS sending is active</p>
						<p class="mt-0.5 text-xs text-emerald-300/70">
							{data.waitingCount} waiting · {data.delayedCount} delayed in queue
						</p>
					</div>
					<button
						type="button"
						onclick={() => doAction('pause')}
						disabled={busy !== null}
						class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 px-4 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
					>
						{busy === 'pause' ? 'Pausing…' : 'Pause SMS'}
					</button>
				</div>
			{/if}

			<!-- Balance + floor -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
					<p class="text-xs font-medium text-slate-500">Master balance</p>
					<p class="mt-1 text-xl font-bold text-white">{fmtMoney(data.balance)}</p>
					<p class="mt-0.5 text-xs text-slate-500">Synced {fmtWhen(data.balanceAt)}</p>
				</div>

				<div class="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
					<label for="sms-floor" class="text-xs font-medium text-slate-500">
						Safety floor ({ccy}) — 0 disables
					</label>
					<div class="mt-1 flex items-center gap-2">
						<input
							id="sms-floor"
							type="number"
							min="0"
							step="0.01"
							bind:value={floorInput}
							class="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 text-sm text-white placeholder:text-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
						/>
						<button
							type="button"
							onclick={saveFloor}
							disabled={busy !== null || floorInput === (data.floor.toString() ?? '')}
							class="inline-flex h-10 shrink-0 items-center rounded-lg border border-slate-700 bg-slate-800/60 px-3 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
						>
							{busy === 'floor' ? 'Saving…' : 'Save'}
						</button>
					</div>
				</div>
			</div>

			{#if actionError}
				<p class="text-xs font-semibold text-red-300">{actionError}</p>
			{/if}
		</div>
	{/if}
</section>
