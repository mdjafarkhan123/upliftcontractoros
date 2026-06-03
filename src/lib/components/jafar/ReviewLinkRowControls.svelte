<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
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

{#if !org.google_review_link}
	<form onsubmit={saveLink} class="flex w-full flex-col gap-1.5 sm:flex-row sm:items-center">
		<input
			type="url"
			placeholder="https://g.page/r/…/review"
			bind:value={linkInput}
			disabled={busy}
			required
			class="h-8 min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-slate-500 focus:outline-none disabled:opacity-50"
		/>
		<button
			type="submit"
			disabled={busy}
			class="inline-flex h-8 shrink-0 items-center rounded-lg bg-slate-800/60 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
		>
			{mode === 'saving' ? 'Saving…' : 'Set link'}
		</button>
	</form>
{:else}
	<form onsubmit={reconcileCount} class="flex w-full flex-col gap-1.5 sm:flex-row sm:items-center">
		<a
			href={org.google_review_link}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors"
			title={org.google_review_link}
		>
			<ExternalLink class="h-3.5 w-3.5" />
		</a>
		<input
			type="number"
			min="0"
			step="1"
			inputmode="numeric"
			bind:value={countInput}
			disabled={busy}
			aria-label="Total Google reviews"
			class="h-8 w-20 shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 text-xs text-slate-200 focus:border-slate-500 focus:outline-none disabled:opacity-50"
		/>
		<button
			type="submit"
			disabled={busy}
			class="inline-flex h-8 shrink-0 items-center rounded-lg bg-slate-800/60 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
		>
			{mode === 'reconciling' ? 'Updating…' : 'Update'}
		</button>
		<button
			type="button"
			disabled={busy}
			onclick={clearLink}
			class="inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-800 px-2 text-[11px] font-medium text-slate-400 hover:border-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
			title="Clear link"
		>
			{mode === 'clearing' ? '…' : 'Clear'}
		</button>
	</form>
{/if}

{#if errorMsg}
	<p class="mt-1 text-[11px] text-red-300">{errorMsg}</p>
{:else if okMsg}
	<p class="mt-1 text-[11px] text-emerald-300">{okMsg}</p>
{:else if org.google_review_link && org.last_review_check_at}
	<p class="mt-1 text-[11px] text-slate-400">
		Last checked {new Date(org.last_review_check_at).toLocaleString()}
	</p>
{/if}
