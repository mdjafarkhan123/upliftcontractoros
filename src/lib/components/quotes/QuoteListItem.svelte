<script lang="ts">
	import QuoteStatusBadge from './QuoteStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteListItem } from '$lib/types/quotes';
	import {
		FileText,
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
	import { goto } from '$app/navigation';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		quote,
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
		quote: QuoteListItem;
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

	const sentLabel = $derived(
		quote.sent_at ? new Date(quote.sent_at).toLocaleDateString('en-US') : null
	);
	const createdLabel = $derived(new Date(quote.created_at).toLocaleDateString('en-US'));

	// Status-driven affordances — mirror the server-side transition rules so the menu
	// only ever offers an action the API will actually accept.
	const isEditable = $derived(quote.status === 'draft' || quote.status === 'changes_requested');
	const isSendable = $derived(quote.status === 'draft');
	const isResendable = $derived(
		quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'changes_requested'
	);
	const isConvertible = $derived(quote.status === 'accepted');
	// Accepted quotes are signed/paid financial records — protected from deletion (mirrors
	// Jobber/Housecall Pro). Everything else (draft, sent, viewed, declined, expired,
	// changes_requested) can be soft-deleted to clear list clutter.
	const isDeletable = $derived(quote.status !== 'accepted');
	// Offline accept/decline only applies to a quote that's out with the client and not
	// yet resolved — mirrors the mark-accepted/mark-declined endpoints' allowed statuses.
	const isMarkable = $derived(
		quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'changes_requested'
	);

	function downloadPdf() {
		const a = document.createElement('a');
		a.href = `/api/quotes/${quote.id}/pdf`;
		a.target = '_blank';
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}
</script>

<a
	href={`/quotes/${quote.id}`}
	use:prefetchOnIntent={() => quotesStore.prefetchDetail(quote.id)}
	class="group block rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-150 ease-out hover:border-primary/30 hover:bg-card-raised hover:shadow-dropdown active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10"
>
	<div class="flex items-start gap-3">
		<div
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			<FileText class="h-5 w-5" />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<span class="font-mono text-xs font-semibold text-muted-foreground">
						{quote.quote_number_display}
					</span>
					<h3 class="truncate text-base font-semibold text-foreground">{quote.contact_name}</h3>
					<p class="truncate text-sm text-muted-foreground">{quote.title}</p>
				</div>
				<div class="flex shrink-0 items-start gap-1.5">
					<div class="flex flex-col items-end gap-1">
						<QuoteStatusBadge status={quote.status} />
						<span class="text-sm font-semibold tabular-nums text-foreground">
							{formatCurrency(quote.total)}
						</span>
					</div>

					<div onclick={(e) => e.stopPropagation()} role="none">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Actions for quote {quote.quote_number_display}"
							>
								<MoreHorizontal class="h-4 w-4" />
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item onclick={() => goto(`/quotes/${quote.id}`)}>
									<ExternalLink class="h-4 w-4" /> Open quote
								</DropdownMenu.Item>
								<DropdownMenu.Item onclick={downloadPdf}>
									<Download class="h-4 w-4" /> Download PDF
								</DropdownMenu.Item>
								{#if canEdit && isEditable}
									<DropdownMenu.Item onclick={() => goto(`/quotes/${quote.id}`)}>
										<Pencil class="h-4 w-4" /> Edit quote
									</DropdownMenu.Item>
								{/if}
								{#if canSend && isSendable && onSend}
									<DropdownMenu.Item onclick={() => onSend(quote)}>
										<Send class="h-4 w-4" /> Send to client
									</DropdownMenu.Item>
								{/if}
								{#if canSend && isResendable && onResend}
									<DropdownMenu.Item onclick={() => onResend(quote)}>
										<RefreshCw class="h-4 w-4" /> Resend to client
									</DropdownMenu.Item>
								{/if}
								{#if canEdit && isMarkable && onMarkAccepted}
									<DropdownMenu.Item onclick={() => onMarkAccepted(quote)}>
										<CircleCheckBig class="h-4 w-4" /> Mark accepted
									</DropdownMenu.Item>
								{/if}
								{#if canEdit && isMarkable && onMarkDeclined}
									<DropdownMenu.Item onclick={() => onMarkDeclined(quote)}>
										<CircleX class="h-4 w-4" /> Mark declined
									</DropdownMenu.Item>
								{/if}
								{#if canConvert && isConvertible && onConvert}
									<DropdownMenu.Item onclick={() => onConvert(quote)}>
										<Receipt class="h-4 w-4" /> Convert to invoice
									</DropdownMenu.Item>
								{/if}
								{#if canDuplicate && onDuplicate}
									<DropdownMenu.Item onclick={() => onDuplicate(quote)}>
										<Copy class="h-4 w-4" /> Duplicate
									</DropdownMenu.Item>
								{/if}
								{#if canDelete && isDeletable && onDelete}
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
					</div>
				</div>
			</div>
			<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				<span>Created {createdLabel}</span>
				{#if sentLabel}
					<span aria-hidden="true">•</span>
					<span>Sent {sentLabel}</span>
				{/if}
			</div>
		</div>
	</div>
</a>
