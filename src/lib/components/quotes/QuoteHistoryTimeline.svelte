<script lang="ts">
	import { Clock, Send, Eye, RefreshCw, PartyPopper, XCircle, ChevronDown } from '@lucide/svelte';
	import { formatCurrency, formatCurrencyExact } from '$lib/utils/format';
	import { cn } from '$lib/utils/cn';
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

	const icons: Record<QuoteTimelineEventType, typeof Send> = {
		sent: Send,
		viewed: Eye,
		revision_requested: RefreshCw,
		accepted: PartyPopper,
		declined: XCircle
	};

	// Chip colors mirror the status color rules: gray sent, blue viewed, amber revision,
	// green accepted, red declined.
	const chipClass: Record<QuoteTimelineEventType, string> = {
		sent: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
		viewed: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
		revision_requested: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		accepted: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
		declined: 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
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
	<div class="rounded-xl border border-border bg-card p-4">
		<div class="mb-3 flex items-center gap-2">
			<Clock class="h-3.5 w-3.5 text-muted-foreground" />
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
		</div>
		<ol>
			{#each events as e, i (e.at + e.type + e.version)}
				{@const Icon = icons[e.type]}
				{@const meta = metaFor(e)}
				{@const expandable = e.type === 'sent'}
				{@const isOpen = expandable && expandedVersion === e.version}
				{@const detail = expandable ? versionByNumber.get(e.version) : undefined}
				<li class="relative flex gap-3 pb-4 last:pb-0">
					{#if i < events.length - 1}
						<span
							class="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border"
							aria-hidden="true"
						></span>
					{/if}
					<span
						class="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full {chipClass[
							e.type
						]}"
					>
						<Icon class="h-3.5 w-3.5" />
					</span>
					<div class="min-w-0 flex-1 pt-1">
						{#if expandable}
							<button
								type="button"
								onclick={() => toggleVersion(e.version)}
								aria-expanded={isOpen}
								class="group flex w-full items-center gap-1.5 text-left"
							>
								<span class="min-w-0 flex-1">
									<span class="text-sm font-medium text-foreground">
										{labelFor(e)}{#if meta}<span class="font-normal text-muted-foreground">
												&nbsp;· {meta}</span
											>{/if}
									</span>
									<span class="block text-xs text-muted-foreground">{whenFor(e.at)}</span>
								</span>
								<ChevronDown
									class={cn(
										'h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground',
										isOpen && 'rotate-180'
									)}
								/>
							</button>

							{#if isOpen}
								<div class="mt-2 rounded-lg border border-border bg-muted/30 p-3">
									{#if versionsLoading && !detail}
										<p class="text-xs text-muted-foreground">Loading version…</p>
									{:else if detail}
										{#if detail.change}
											<p class="mb-2 text-xs font-medium text-muted-foreground">
												Changed since v{detail.change.prev_version}:
												<span class="text-foreground">{changeSummary(detail.change)}</span>
											</p>
										{:else}
											<p class="mb-2 text-xs font-medium text-muted-foreground">Initial version</p>
										{/if}

										<ul class="divide-y divide-border/60">
											{#each detail.line_items as li (li.position)}
												<li class="flex items-start justify-between gap-3 py-1.5">
													<div class="min-w-0">
														<p class="truncate text-sm text-foreground">{li.description}</p>
														{#if li.details}
															<p class="truncate text-xs text-muted-foreground">{li.details}</p>
														{/if}
														<p class="text-xs text-muted-foreground">
															{formatQty(li.quantity)}{#if li.unit}&nbsp;{li.unit}{/if} ×
															{formatCurrencyExact(li.unit_price)}
														</p>
													</div>
													<span class="shrink-0 text-sm tabular-nums text-foreground">
														{formatCurrencyExact(li.total)}
													</span>
												</li>
											{/each}
										</ul>

										<div class="mt-2 space-y-0.5 border-t border-border pt-2 text-xs">
											<div class="flex justify-between text-muted-foreground">
												<span>Subtotal</span>
												<span class="tabular-nums">{formatCurrencyExact(detail.subtotal)}</span>
											</div>
											{#if detail.discount_amount && Number(detail.discount_amount) > 0}
												<div class="flex justify-between text-emerald-600 dark:text-emerald-400">
													<span>Discount</span>
													<span class="tabular-nums"
														>−{formatCurrencyExact(detail.discount_amount)}</span
													>
												</div>
											{/if}
											{#if Number(detail.tax_amount) > 0}
												<div class="flex justify-between text-muted-foreground">
													<span>Tax</span>
													<span class="tabular-nums">{formatCurrencyExact(detail.tax_amount)}</span>
												</div>
											{/if}
											<div
												class="flex justify-between pt-0.5 text-sm font-semibold text-foreground"
											>
												<span>Total</span>
												<span class="tabular-nums">{formatCurrencyExact(detail.total)}</span>
											</div>
										</div>
									{:else}
										<p class="text-xs text-muted-foreground">Version detail unavailable.</p>
									{/if}
								</div>
							{/if}
						{:else}
							<p class="text-sm font-medium text-foreground">
								{labelFor(e)}{#if meta}<span class="font-normal text-muted-foreground">
										&nbsp;· {meta}</span
									>{/if}
							</p>
							<p class="text-xs text-muted-foreground">{whenFor(e.at)}</p>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</div>
{/if}
