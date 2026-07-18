<script lang="ts">
	// "Created from a request" provenance banner (Jobber back-link). Rendered on a
	// quote/job detail page when the record carries a request_id, so the contractor
	// can jump back to the originating request (read-only once converted). Shared by
	// both quote and job detail pages — one component, not two copies (Rule 23).
	//
	// Self-contained: it fetches the request's summary itself, so the quote/job detail
	// endpoints need no extra join. Silently hides if the request can't be loaded
	// (deleted, or the viewer lacks request access) — the banner is a convenience.
	import RequestStatusBadge from './RequestStatusBadge.svelte';
	import type { RequestDerivedStatus } from '$lib/types/requests';

	let { requestId }: { requestId: string } = $props();

	type Summary = { id: string; title: string; status: RequestDerivedStatus };
	let summary = $state<Summary | null>(null);
	let loading = $state(true);

	$effect(() => {
		const id = requestId;
		loading = true;
		summary = null;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/requests/${id}`);
				if (!res.ok) return;
				const body = await res.json().catch(() => ({}));
				const d = body?.data;
				if (!cancelled && d) summary = { id: d.id, title: d.title, status: d.status };
			} catch {
				// Network error → leave the banner hidden.
			} finally {
				if (!cancelled) loading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if loading}
	<div class="request-backlink request-backlink--loading" aria-hidden="true">
		<span class="request-backlink__skeleton"></span>
	</div>
{:else if summary}
	<a class="request-backlink" href="/requests/{summary.id}">
		<span class="request-backlink__icon"><i class="ri-inbox-archive-line"></i></span>
		<span class="request-backlink__body">
			<span class="request-backlink__eyebrow">Created from request</span>
			<span class="request-backlink__title">{summary.title}</span>
		</span>
		<RequestStatusBadge status={summary.status} />
		<span class="request-backlink__chevron"><i class="ri-arrow-right-line"></i></span>
	</a>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.request-backlink {
		display: flex;
		align-items: center;
		gap: $space-3;
		padding: $space-3 $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		background: var(--color-bg-surface);
		text-decoration: none;
		color: inherit;

		&:hover {
			background: var(--color-bg-surface-sunk);
			border-color: var(--color-border-strong, var(--color-border));
		}
	}

	.request-backlink__icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-secondary);
		font-size: 1.6rem;
	}

	.request-backlink__body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.request-backlink__eyebrow {
		font-size: $fs-caption;
		font-weight: $weight-semibold;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
	}

	.request-backlink__title {
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.request-backlink__chevron {
		color: var(--color-text-secondary);
		font-size: 1.4rem;
	}

	.request-backlink--loading {
		height: 62px;
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		padding: $space-3 $space-4;
		display: flex;
		align-items: center;
	}

	.request-backlink__skeleton {
		display: block;
		width: 60%;
		height: 14px;
		border-radius: $radius-full;
		background: var(--color-bg-surface-sunk);
		animation: request-backlink-pulse 1.2s ease-in-out infinite;
	}

	@keyframes request-backlink-pulse {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}
</style>
