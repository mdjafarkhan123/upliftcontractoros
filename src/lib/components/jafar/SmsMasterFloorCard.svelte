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

<section class="jafar-panel">
	<header class="jafar-panel__head jafar-panel__head--between">
		<div>
			<h2 class="jafar-panel__title">SMS Master Balance</h2>
			<p class="jafar-panel__sub">Platform-wide Twilio safety floor &amp; kill switch</p>
		</div>
		<button
			type="button"
			onclick={() => doAction('refresh')}
			disabled={busy !== null || status !== 'loaded'}
			class="jafar-btn"
		>
			{busy === 'refresh' ? 'Refreshing…' : 'Refresh balance'}
		</button>
	</header>

	{#if status === 'loading'}
		<div class="sms-loading">Loading SMS controls…</div>
	{:else if status === 'error'}
		<div class="sms-error">
			<p class="sms-error__msg">{loadError}</p>
			<button type="button" onclick={load} class="jafar-btn jafar-btn--danger sms-error__retry">
				Retry
			</button>
		</div>
	{:else if data}
		<div class="jafar-panel__body">
			<div
				class="jafar-sms__status {data.paused
					? 'jafar-sms__status--paused'
					: 'jafar-sms__status--active'}"
			>
				<div>
					{#if data.paused}
						<p class="jafar-sms__paused-title">SMS sending is PAUSED</p>
						<p class="jafar-sms__paused-text">
							{data.pausedReason ?? 'Outbound SMS is paused.'}
							{#if data.pausedAt}
								<span>&nbsp;· {fmtWhen(data.pausedAt)}</span>
							{/if}
						</p>
						<p class="jafar-sms__paused-note">
							{data.waitingCount} waiting · {data.delayedCount} delayed in queue — they resume on restart.
						</p>
					{:else}
						<p class="jafar-sms__active-title">SMS sending is active</p>
						<p class="jafar-sms__active-text">
							{data.waitingCount} waiting · {data.delayedCount} delayed in queue
						</p>
					{/if}
				</div>
				{#if data.paused}
					<button
						type="button"
						onclick={() => doAction('resume')}
						disabled={busy !== null}
						class="jafar-btn jafar-btn--emerald"
					>
						{busy === 'resume' ? 'Resuming…' : 'Resume SMS'}
					</button>
				{:else}
					<button
						type="button"
						onclick={() => doAction('pause')}
						disabled={busy !== null}
						class="jafar-btn"
					>
						{busy === 'pause' ? 'Pausing…' : 'Pause SMS'}
					</button>
				{/if}
			</div>

			<div class="jafar-sms__grid">
				<div class="jafar-sms__stat">
					<p class="jafar-sms__stat-label">Master balance</p>
					<p class="jafar-sms__stat-val">{fmtMoney(data.balance)}</p>
					<p class="jafar-sms__stat-sub">Synced {fmtWhen(data.balanceAt)}</p>
				</div>

				<div class="jafar-sms__stat">
					<label for="sms-floor" class="jafar-sms__stat-label">
						Safety floor ({ccy}) — 0 disables
					</label>
					<div class="jafar-sms__stat-row">
						<input
							id="sms-floor"
							type="number"
							min="0"
							step="0.01"
							bind:value={floorInput}
							class="jafar-input"
						/>
						<button
							type="button"
							onclick={saveFloor}
							disabled={busy !== null || floorInput === (data.floor.toString() ?? '')}
							class="jafar-btn"
						>
							{busy === 'floor' ? 'Saving…' : 'Save'}
						</button>
					</div>
				</div>
			</div>

			{#if actionError}
				<p class="jafar-sms__err">{actionError}</p>
			{/if}
		</div>
	{/if}
</section>

<style lang="scss">
	.sms-loading {
		padding: 2.5rem 1.25rem;
		text-align: center;
		font-size: 0.875rem;
		color: #64748b;
	}

	.sms-error {
		padding: 2rem 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;

		&__msg {
			font-size: 0.875rem;
			font-weight: 600;
			color: #fecaca;
		}

		&__retry {
			min-width: 6rem;
		}
	}
</style>
