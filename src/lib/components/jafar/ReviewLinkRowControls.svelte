<script lang="ts">
	import { jafarDashboardStore, type OrgRow } from '$lib/stores/jafarDashboard.svelte';

	let { org }: { org: OrgRow } = $props();

	type Mode = 'idle' | 'saving' | 'reconciling' | 'clearing';
	let mode = $state<Mode>('idle');
	let errorMsg = $state<string | null>(null);
	let okMsg = $state<string | null>(null);

	type ApiErrorBody = {
		error?: string;
		field_errors?: Record<string, string>;
	};

	function readError(body: unknown, fallback: string): string {
		const b = (body ?? {}) as ApiErrorBody;
		if (b.field_errors) {
			const first = Object.values(b.field_errors)[0];
			if (first) return first;
		}
		return b.error ?? fallback;
	}

	let linkInput = $state(org.google_review_link ?? '');
	let countInput = $state<number | ''>(org.last_known_review_count ?? 0);

	$effect(() => {
		linkInput = org.google_review_link ?? '';
		countInput = org.last_known_review_count ?? 0;
	});

	function flashOk(message: string) {
		okMsg = message;
		setTimeout(() => {
			okMsg = null;
		}, 1800);
	}

	async function saveLink(e: Event) {
		e.preventDefault();
		if (mode !== 'idle') return;
		const trimmed = linkInput.trim();
		if (!trimmed) {
			errorMsg = 'Enter a URL.';
			return;
		}
		mode = 'saving';
		errorMsg = null;
		try {
			const res = await fetch(`/api/admin/orgs/${org.id}/review-link`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ google_review_link: trimmed })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = readError(body, 'Failed to save link.');
				return;
			}
			const link =
				(body as { data?: { google_review_link: string | null } }).data?.google_review_link ?? null;
			jafarDashboardStore.patchOrg(org.id, { google_review_link: link });
			if (link) linkInput = link;
			flashOk('Link saved.');
		} catch {
			errorMsg = 'Network error.';
		} finally {
			mode = 'idle';
		}
	}

	async function reconcileCount(e: Event) {
		e.preventDefault();
		if (mode !== 'idle') return;
		const n = typeof countInput === 'number' ? countInput : Number(countInput);
		if (!Number.isInteger(n) || n < 0) {
			errorMsg = 'Enter a non-negative integer.';
			return;
		}
		mode = 'reconciling';
		errorMsg = null;
		try {
			const res = await fetch(`/api/admin/orgs/${org.id}/reconcile-review-count`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ new_count: n })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = readError(body, 'Failed to queue reconciliation.');
				return;
			}
			const data = (body as { data?: { new_count?: number; delta?: number } }).data;
			const serverCount = typeof data?.new_count === 'number' ? data.new_count : n;
			const delta = typeof data?.delta === 'number' ? data.delta : 0;
			jafarDashboardStore.patchOrg(org.id, {
				last_known_review_count: serverCount,
				last_review_check_at: new Date().toISOString()
			});
			countInput = serverCount;
			flashOk(delta > 0 ? `Queued — Δ +${delta}.` : 'Queued.');
		} catch {
			errorMsg = 'Network error.';
		} finally {
			mode = 'idle';
		}
	}

	async function clearLink() {
		if (mode !== 'idle') return;
		mode = 'clearing';
		errorMsg = null;
		try {
			const res = await fetch(`/api/admin/orgs/${org.id}/review-link`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ google_review_link: null })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = readError(body, 'Failed to clear link.');
				return;
			}
			const link =
				(body as { data?: { google_review_link: string | null } }).data?.google_review_link ?? null;
			jafarDashboardStore.patchOrg(org.id, { google_review_link: link });
			linkInput = '';
			flashOk('Link cleared.');
		} catch {
			errorMsg = 'Network error.';
		} finally {
			mode = 'idle';
		}
	}

	const busy = $derived(mode !== 'idle');
</script>

<div class="jafar-review">
	{#if !org.google_review_link}
		<form onsubmit={saveLink} class="review-form">
			<input
				type="url"
				placeholder="https://g.page/r/…/review"
				bind:value={linkInput}
				disabled={busy}
				required
				class="jafar-input jafar-input--sm jafar-input--compact review-url-input"
			/>
			<button type="submit" disabled={busy} class="jafar-btn jafar-btn--sm">
				{mode === 'saving' ? 'Saving…' : 'Set link'}
			</button>
		</form>
	{:else}
		<form onsubmit={reconcileCount} class="review-form">
			<a
				href={org.google_review_link}
				target="_blank"
				rel="noopener noreferrer"
				class="jafar-btn jafar-btn--sm"
				title={org.google_review_link}
			>
				<i class="ri-external-link-line" aria-hidden="true"></i>
			</a>
			<input
				type="number"
				min="0"
				step="1"
				inputmode="numeric"
				bind:value={countInput}
				disabled={busy}
				aria-label="Total Google reviews"
				class="jafar-input jafar-input--sm jafar-input--compact review-count-input"
			/>
			<button type="submit" disabled={busy} class="jafar-btn jafar-btn--sm">
				{mode === 'reconciling' ? 'Updating…' : 'Update'}
			</button>
			<button
				type="button"
				disabled={busy}
				onclick={clearLink}
				class="jafar-btn jafar-btn--sm"
				title="Clear link"
			>
				{mode === 'clearing' ? '…' : 'Clear'}
			</button>
		</form>
	{/if}

	{#if errorMsg}
		<p class="jafar-review__msg jafar-review__msg--err">{errorMsg}</p>
	{:else if okMsg}
		<p class="jafar-review__msg jafar-review__msg--ok">{okMsg}</p>
	{:else if org.google_review_link && org.last_review_check_at}
		<p class="jafar-review__msg jafar-review__msg--sub">
			Last checked {new Date(org.last_review_check_at).toLocaleString()}
		</p>
	{/if}
</div>

<style lang="scss">
	.review-form {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
		width: 100%;
		@media (min-width: 640px) {
			flex-wrap: nowrap;
		}
	}

	.review-url-input {
		flex: 1;
		min-width: 0;
	}

	.review-count-input {
		width: 5rem;
		flex-shrink: 0;
	}
</style>
