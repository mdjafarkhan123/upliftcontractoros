<script lang="ts">
	import { Clock, Send, Eye, RefreshCw, PartyPopper, XCircle } from '@lucide/svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteTimelineEvent, QuoteTimelineEventType } from '$lib/types/quotes';

	let { quoteId }: { quoteId: string } = $props();

	let events = $state<QuoteTimelineEvent[]>([]);
	let loaded = $state(false);

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

	$effect(() => {
		const id = quoteId;
		events = [];
		loaded = false;
		void load(id);
	});

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
						<p class="text-sm font-medium text-foreground">
							{labelFor(e)}{#if meta}<span class="font-normal text-muted-foreground">
									&nbsp;· {meta}</span
								>{/if}
						</p>
						<p class="text-xs text-muted-foreground">{whenFor(e.at)}</p>
					</div>
				</li>
			{/each}
		</ol>
	</div>
{/if}
