<script lang="ts">
	import QuoteStatusBadge from './QuoteStatusBadge.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { QuoteListItem } from '$lib/types/quotes';
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

	const isEditable = $derived(quote.status === 'draft' || quote.status === 'changes_requested');
	const isSendable = $derived(quote.status === 'draft');
	const isResendable = $derived(
		quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'changes_requested'
	);
	const isConvertible = $derived(quote.status === 'accepted');
	const isDeletable = $derived(quote.status !== 'accepted');
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
	class="quote-card"
>
	<div class="quote-card__inner">
		<div class="quote-card__icon-wrap" aria-hidden="true">
			<i class="ri-file-text-line"></i>
		</div>

		<div class="quote-card__body">
			<div class="quote-card__header">
				<div class="quote-card__info">
					<span class="quote-card__number">{quote.quote_number_display}</span>
					<span class="quote-card__name">{quote.contact_name}</span>
					<span class="quote-card__title">{quote.title}</span>
				</div>

				<div class="quote-card__right">
					<div class="quote-card__actions">
						<QuoteStatusBadge status={quote.status} />
						<span class="quote-card__amount">{formatCurrency(quote.total)}</span>
					</div>

					<div onclick={(e) => e.stopPropagation()} role="none">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="quote-card__menu-btn"
								aria-label="Actions for quote {quote.quote_number_display}"
							>
								<i class="ri-more-2-fill" aria-hidden="true"></i>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item onclick={() => goto(`/quotes/${quote.id}`)}>
									<i class="ri-external-link-line"></i> Open quote
								</DropdownMenu.Item>
								<DropdownMenu.Item onclick={downloadPdf}>
									<i class="ri-download-line"></i> Download PDF
								</DropdownMenu.Item>
								{#if canEdit && isEditable}
									<DropdownMenu.Item onclick={() => goto(`/quotes/${quote.id}`)}>
										<i class="ri-pencil-line"></i> Edit quote
									</DropdownMenu.Item>
								{/if}
								{#if canSend && isSendable && onSend}
									<DropdownMenu.Item onclick={() => onSend(quote)}>
										<i class="ri-send-plane-line"></i> Send to client
									</DropdownMenu.Item>
								{/if}
								{#if canSend && isResendable && onResend}
									<DropdownMenu.Item onclick={() => onResend(quote)}>
										<i class="ri-refresh-line"></i> Resend to client
									</DropdownMenu.Item>
								{/if}
								{#if canEdit && isMarkable && onMarkAccepted}
									<DropdownMenu.Item onclick={() => onMarkAccepted(quote)}>
										<i class="ri-checkbox-circle-line"></i> Mark accepted
									</DropdownMenu.Item>
								{/if}
								{#if canEdit && isMarkable && onMarkDeclined}
									<DropdownMenu.Item onclick={() => onMarkDeclined(quote)}>
										<i class="ri-close-circle-line"></i> Mark declined
									</DropdownMenu.Item>
								{/if}
								{#if canConvert && isConvertible && onConvert}
									<DropdownMenu.Item onclick={() => onConvert(quote)}>
										<i class="ri-file-list-3-line"></i> Convert to invoice
									</DropdownMenu.Item>
								{/if}
								{#if canDuplicate && onDuplicate}
									<DropdownMenu.Item onclick={() => onDuplicate(quote)}>
										<i class="ri-file-copy-line"></i> Duplicate
									</DropdownMenu.Item>
								{/if}
								{#if canDelete && isDeletable && onDelete}
									<DropdownMenu.Separator />
									<DropdownMenu.Item variant="destructive" onclick={() => onDelete(quote)}>
										<i class="ri-delete-bin-line"></i> Delete quote
									</DropdownMenu.Item>
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</div>
			</div>

			<div class="quote-card__meta">
				<span>Created {createdLabel}</span>
				{#if sentLabel}
					<span class="quote-card__sep" aria-hidden="true">·</span>
					<span>Sent {sentLabel}</span>
				{/if}
			</div>
		</div>
	</div>
</a>
