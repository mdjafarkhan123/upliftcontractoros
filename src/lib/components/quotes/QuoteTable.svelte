<script lang="ts">
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils/cn';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import type { QuoteListItem } from '$lib/types/quotes';
	import QuoteStatusBadge from './QuoteStatusBadge.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatCurrency } from '$lib/utils/format';
	import {
		MoreHorizontal,
		ExternalLink,
		Download,
		Pencil,
		Send,
		RefreshCw,
		Receipt,
		Copy,
		CircleCheckBig,
		CircleX,
		Trash2
	} from '@lucide/svelte';

	let {
		items,
		canEdit = false,
		canSend = false,
		canConvert = false,
		canDuplicate = false,
		canDelete = false,
		onSend,
		onResend,
		onConvert,
		onDuplicate,
		onMarkAccepted,
		onMarkDeclined,
		onDelete
	}: {
		items: QuoteListItem[];
		canEdit?: boolean;
		canSend?: boolean;
		canConvert?: boolean;
		canDuplicate?: boolean;
		canDelete?: boolean;
		onSend?: (quote: QuoteListItem) => void;
		onResend?: (quote: QuoteListItem) => void;
		onConvert?: (quote: QuoteListItem) => void;
		onDuplicate?: (quote: QuoteListItem) => void;
		onMarkAccepted?: (quote: QuoteListItem) => void;
		onMarkDeclined?: (quote: QuoteListItem) => void;
		onDelete?: (quote: QuoteListItem) => void;
	} = $props();

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function isExpired(iso: string | null): boolean {
		if (!iso) return false;
		return new Date(iso) < new Date();
	}

	function downloadPdf(quote: QuoteListItem, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const a = document.createElement('a');
		a.href = `/api/quotes/${quote.id}/pdf`;
		a.target = '_blank';
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function statusAllows(quote: QuoteListItem) {
		return {
			editable: quote.status === 'draft' || quote.status === 'changes_requested',
			sendable: quote.status === 'draft',
			resendable: quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'changes_requested',
			convertible: quote.status === 'accepted',
			deletable: quote.status !== 'accepted',
			markable: quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'changes_requested'
		};
	}
</script>

<div class="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
	<div class="overflow-x-auto">
		<table class="w-full min-w-[640px] text-sm">
			<thead>
				<tr class="border-b border-border/60 bg-muted/30">
					<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Quote
					</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
						Client
					</th>
					<th class="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Status
					</th>
					<th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Total
					</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">
						Sent
					</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">
						Expires
					</th>
					<th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground 2xl:table-cell">
						Created
					</th>
					<th class="w-12 px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-border/30">
				{#each items as quote (quote.id)}
					{@const a = statusAllows(quote)}
					<tr
						class="group cursor-pointer transition-colors hover:bg-muted/40"
						use:prefetchOnIntent={() => quotesStore.prefetchDetail(quote.id)}
						onclick={() => goto(`/quotes/${quote.id}`)}
					>
						<!-- Quote number + title -->
						<td class="px-4 py-3.5">
							<div class="min-w-0">
								<span class="font-mono text-[11px] font-semibold text-muted-foreground">
									{quote.quote_number_display}
								</span>
								<a
									href="/quotes/{quote.id}"
									onclick={(e) => e.stopPropagation()}
									class="block truncate font-medium leading-snug text-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
								>
									{quote.title}
								</a>
								<!-- Client shown inline on small screens -->
								<p class="truncate text-[11px] text-muted-foreground lg:hidden">{quote.contact_name}</p>
							</div>
						</td>

						<!-- Client -->
						<td class="hidden px-4 py-3.5 lg:table-cell">
							<a
								href="/contacts/{quote.contact_id}"
								onclick={(e) => e.stopPropagation()}
								class="truncate text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none"
							>
								{quote.contact_name}
							</a>
						</td>

						<!-- Status -->
						<td class="px-4 py-3.5">
							<QuoteStatusBadge status={quote.status} />
						</td>

						<!-- Total -->
						<td class="px-4 py-3.5 text-right">
							<span class="tabular-nums font-semibold text-foreground">
								{formatCurrency(quote.total)}
							</span>
						</td>

						<!-- Sent -->
						<td class="hidden whitespace-nowrap px-4 py-3.5 xl:table-cell">
							{#if quote.sent_at}
								<span class="text-muted-foreground">{fmtDate(quote.sent_at)}</span>
							{:else}
								<span class="italic text-muted-foreground/40">Not sent</span>
							{/if}
						</td>

						<!-- Expires -->
						<td class="hidden whitespace-nowrap px-4 py-3.5 xl:table-cell">
							{#if quote.expires_at}
								<span class={cn('text-muted-foreground', isExpired(quote.expires_at) && quote.status !== 'accepted' && 'text-destructive')}>
									{fmtDate(quote.expires_at)}
								</span>
							{:else}
								<span class="italic text-muted-foreground/40">No expiry</span>
							{/if}
						</td>

						<!-- Created -->
						<td class="hidden whitespace-nowrap px-4 py-3.5 2xl:table-cell">
							<span class="text-muted-foreground">{fmtDate(quote.created_at)}</span>
						</td>

						<!-- Actions -->
						<td class="w-12 px-2 py-3.5" onclick={(e) => e.stopPropagation()}>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									class={cn(
										'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
									)}
									aria-label="Actions for quote {quote.quote_number_display}"
								>
									<MoreHorizontal class="h-4 w-4" />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item onclick={() => goto(`/quotes/${quote.id}`)}>
										<ExternalLink class="h-4 w-4" /> Open quote
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={(e) => downloadPdf(quote, e)}>
										<Download class="h-4 w-4" /> Download PDF
									</DropdownMenu.Item>
									{#if canEdit && a.editable}
										<DropdownMenu.Item onclick={() => goto(`/quotes/${quote.id}`)}>
											<Pencil class="h-4 w-4" /> Edit quote
										</DropdownMenu.Item>
									{/if}
									{#if canSend && a.sendable && onSend}
										<DropdownMenu.Item onclick={() => onSend(quote)}>
											<Send class="h-4 w-4" /> Send to client
										</DropdownMenu.Item>
									{/if}
									{#if canSend && a.resendable && onResend}
										<DropdownMenu.Item onclick={() => onResend(quote)}>
											<RefreshCw class="h-4 w-4" /> Resend to client
										</DropdownMenu.Item>
									{/if}
									{#if canEdit && a.markable && onMarkAccepted}
										<DropdownMenu.Item onclick={() => onMarkAccepted(quote)}>
											<CircleCheckBig class="h-4 w-4" /> Mark accepted
										</DropdownMenu.Item>
									{/if}
									{#if canEdit && a.markable && onMarkDeclined}
										<DropdownMenu.Item onclick={() => onMarkDeclined(quote)}>
											<CircleX class="h-4 w-4" /> Mark declined
										</DropdownMenu.Item>
									{/if}
									{#if canConvert && a.convertible && onConvert}
										<DropdownMenu.Item onclick={() => onConvert(quote)}>
											<Receipt class="h-4 w-4" /> Convert to invoice
										</DropdownMenu.Item>
									{/if}
									{#if canDuplicate && onDuplicate}
										<DropdownMenu.Item onclick={() => onDuplicate(quote)}>
											<Copy class="h-4 w-4" /> Duplicate
										</DropdownMenu.Item>
									{/if}
									{#if canDelete && a.deletable && onDelete}
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											class="text-destructive focus:bg-destructive/10 focus:text-destructive"
											onclick={() => onDelete(quote)}
										>
											<Trash2 class="h-4 w-4" /> Delete quote
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
