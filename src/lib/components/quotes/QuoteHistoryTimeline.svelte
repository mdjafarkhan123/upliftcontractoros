<script lang="ts">
	import { formatCurrency, formatCurrencyExact } from '$lib/utils/format';
	import type {
		QuoteTimelineEvent,
		QuoteTimelineEventType,
		QuoteVersionDetail
	} from '$lib/types/quotes';

	let { quoteId }: { quoteId: string } = $props();

	let events = $state<QuoteTimelineEvent[]>([]);
	let loaded = $state(false);

	// Frozen version snapshots are lazy-loaded on first expand so the panel stays
	// light for quotes with large line-item lists.
	let versions = $state<QuoteVersionDetail[]>([]);
	let versionsLoaded = $state(false);
	let versionsLoading = $state(false);
	let expandedVersion = $state<number | null>(null);

	async function load(id: string) {
		try {
			const res = await fetch(`/api/quotes/${id}/timeline`);
			if (!res.ok) return;
			const body = await res.json();
			events = body.data?.events ?? [];
		} catch {
			// Non-critical panel — stay silent on failure rather than blocking the page.
		} finally {
			loaded = true;
		}
	}

	async function loadVersions(id: string) {
		if (versionsLoaded || versionsLoading) return;
		versionsLoading = true;
		try {
			const res = await fetch(`/api/quotes/${id}/versions`);
			if (!res.ok) return;
			const body = await res.json();
			versions = body.data?.versions ?? [];
			versionsLoaded = true;
		} catch {
			// Silent — expanding just won't reveal detail.
		} finally {
			versionsLoading = false;
		}
	}

	async function toggleVersion(version: number) {
		if (expandedVersion === version) {
			expandedVersion = null;
			return;
		}
		await loadVersions(quoteId);
		expandedVersion = version;
	}

	$effect(() => {
		const id = quoteId;
		events = [];
		loaded = false;
		versions = [];
		versionsLoaded = false;
		versionsLoading = false;
		expandedVersion = null;
		void load(id);
	});

	const versionByNumber = $derived(new Map(versions.map((v) => [v.version, v])));

	// RI icon class per event type
	const icons: Record<QuoteTimelineEventType, string> = {
		sent: 'ri-send-plane-line',
		viewed: 'ri-eye-line',
		revision_requested: 'ri-refresh-line',
		accepted: 'ri-emotion-happy-line',
		declined: 'ri-close-circle-line'
	};

	// BEM dot modifier per event type
	const dotMod: Record<QuoteTimelineEventType, string> = {
		sent: 'quote-timeline__dot--sent',
		viewed: 'quote-timeline__dot--viewed',
		revision_requested: 'quote-timeline__dot--revision',
		accepted: 'quote-timeline__dot--accepted',
		declined: 'quote-timeline__dot--declined'
	};

	function labelFor(e: QuoteTimelineEvent): string {
		switch (e.type) {
			case 'sent':
				return `Sent v${e.version}`;
			case 'viewed':
				return `Viewed v${e.version}`;
			case 'revision_requested':
				return 'Revision requested';
			case 'accepted':
				return `Accepted v${e.version}`;
			case 'declined':
				return `Declined v${e.version}`;
		}
	}

	function metaFor(e: QuoteTimelineEvent): string | null {
		if (e.type === 'sent' && e.total != null) return formatCurrency(e.total);
		if (e.type === 'viewed' && e.view_count && e.view_count > 1) return `${e.view_count} views`;
		return null;
	}

	function whenFor(iso: string): string {
		return new Date(iso).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// Quantity is stored as a numeric string ("2.00"); show it without trailing zeros.
	function formatQty(s: string): string {
		const n = Number(s);
		return isNaN(n) ? s : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
	}

	// Reliable change summary from stored numbers only — never a guessed line-by-line diff.
	function changeSummary(c: NonNullable<QuoteVersionDetail['change']>): string {
		const parts: string[] = [];
		const d = c.item_count_delta;
		if (d > 0) parts.push(`${d} item${d > 1 ? 's' : ''} added`);
		else if (d < 0) parts.push(`${-d} item${-d > 1 ? 's' : ''} removed`);
		else parts.push('same item count');

		const td = Number(c.total_delta);
		if (td > 0) parts.push(`total +${formatCurrencyExact(td)}`);
		else if (td < 0) parts.push(`total −${formatCurrencyExact(-td)}`);
		else parts.push('total unchanged');

		return parts.join(' · ');
	}
</script>

{#if loaded && events.length > 0}
	<div class="quote-timeline">
		<div class="quote-timeline__header">
			<i class="ri-time-line" aria-hidden="true"></i>
			<h2 class="quote-timeline__heading">History</h2>
		</div>
		<ol class="quote-timeline__list">
			{#each events as e, i (e.at + e.type + e.version)}
				{@const meta = metaFor(e)}
				{@const expandable = e.type === 'sent'}
				{@const isOpen = expandable && expandedVersion === e.version}
				{@const detail = expandable ? versionByNumber.get(e.version) : undefined}
				<li class="quote-timeline__item">
					{#if i < events.length - 1}
						<span class="quote-timeline__connector" aria-hidden="true"></span>
					{/if}
					<span class="quote-timeline__dot {dotMod[e.type]}" aria-hidden="true">
						<i class={icons[e.type]}></i>
					</span>
					<div class="quote-timeline__body">
						{#if expandable}
							<button
								type="button"
								onclick={() => toggleVersion(e.version)}
								aria-expanded={isOpen}
								class="quote-timeline__expand-btn"
							>
								<span class="quote-timeline__expand-text">
									<span class="quote-timeline__label">
										{labelFor(e)}{#if meta}<span class="quote-timeline__meta">&nbsp;· {meta}</span>{/if}
									</span>
									<span class="quote-timeline__time">{whenFor(e.at)}</span>
								</span>
								<i
									class="quote-timeline__expand-icon ri-arrow-down-s-line{isOpen
										? ' quote-timeline__expand-icon--open'
										: ''}"
									aria-hidden="true"
								></i>
							</button>

							{#if isOpen}
								<div class="quote-timeline__detail">
									{#if versionsLoading && !detail}
										<p class="quote-timeline__change-summary">Loading version…</p>
									{:else if detail}
										{#if detail.change}
											<p class="quote-timeline__change-summary">
												Changed since v{detail.change.prev_version}:
												<span>{changeSummary(detail.change)}</span>
											</p>
										{:else}
											<p class="quote-timeline__change-summary">Initial version</p>
										{/if}

										<ul class="quote-timeline__line-list">
											{#each detail.line_items as li (li.position)}
												<li class="quote-timeline__line-item">
													<div style="min-width:0;flex:1;">
														<p class="quote-timeline__line-desc">{li.description}</p>
														{#if li.details}
															<p class="quote-timeline__line-sub">{li.details}</p>
														{/if}
														<p class="quote-timeline__line-qty">
															{formatQty(li.quantity)}{#if li.unit}&nbsp;{li.unit}{/if} ×
															{formatCurrencyExact(li.unit_price)}
														</p>
													</div>
													<span class="quote-timeline__line-total">
														{formatCurrencyExact(li.total)}
													</span>
												</li>
											{/each}
										</ul>

										<div class="quote-timeline__totals">
											<div class="quote-timeline__total-row">
												<span>Subtotal</span>
												<span>{formatCurrencyExact(detail.subtotal)}</span>
											</div>
											{#if detail.discount_amount && Number(detail.discount_amount) > 0}
												<div class="quote-timeline__total-row quote-timeline__total-row--discount">
													<span>Discount</span>
													<span>−{formatCurrencyExact(detail.discount_amount)}</span>
												</div>
											{/if}
											{#if Number(detail.tax_amount) > 0}
												<div class="quote-timeline__total-row">
													<span>Tax</span>
													<span>{formatCurrencyExact(detail.tax_amount)}</span>
												</div>
											{/if}
											<div class="quote-timeline__total-row quote-timeline__total-row--grand">
												<span>Total</span>
												<span>{formatCurrencyExact(detail.total)}</span>
											</div>
										</div>
									{:else}
										<p class="quote-timeline__change-summary">Version detail unavailable.</p>
									{/if}
								</div>
							{/if}
						{:else}
							<p class="quote-timeline__label">
								{labelFor(e)}{#if meta}<span class="quote-timeline__meta">&nbsp;· {meta}</span>{/if}
							</p>
							<span class="quote-timeline__time">{whenFor(e.at)}</span>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</div>
{/if}
