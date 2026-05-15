<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import QuoteStatusBadge from '$lib/components/quotes/QuoteStatusBadge.svelte';
	import QuoteTotalsCard from '$lib/components/quotes/QuoteTotalsCard.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import SendQuoteDialog from '$lib/components/quotes/SendQuoteDialog.svelte';
	import ApplyTemplateDialog from '$lib/components/quotes/ApplyTemplateDialog.svelte';
	import DownloadPdfButton from '$lib/components/quotes/DownloadPdfButton.svelte';
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { Eye, FileText, Save, Send, Trash2, Loader2 } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { QuoteDetail, QuoteLineDraft, QuoteLineItemRow } from '$lib/types/quotes';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const quote = $derived(quotesStore.getDetail(data.id));
	const detailStatus = $derived(quotesStore.getDetailStatus(data.id));
	const detailError = $derived(quotesStore.getDetailError(data.id));
	const showSkeleton = $derived(!quote && detailStatus !== 'error');

	function toDrafts(rows: QuoteLineItemRow[]): QuoteLineDraft[] {
		return rows.map((li) => ({
			client_id: li.id,
			description: li.description,
			quantity: li.quantity,
			unit_price: li.unit_price
		}));
	}

	let lineItems = $state<QuoteLineDraft[]>([]);
	let titleDraft = $state('');
	let taxRateDraft = $state('0');
	let notesDraft = $state('');
	let initializedForId = $state<string | null>(null);

	function initDrafts(q: QuoteDetail) {
		lineItems = toDrafts(q.line_items);
		titleDraft = q.title;
		taxRateDraft = String(Number(q.tax_rate) * 100);
		notesDraft = q.notes ?? '';
		initializedForId = q.id;
	}

	$effect(() => {
		void quotesStore.loadDetail(data.id);
	});

	$effect(() => {
		if (quote && initializedForId !== quote.id) {
			initDrafts(quote);
		}
	});

	let sendOpen = $state(false);
	let templateOpen = $state(false);
	let saving = $state(false);
	let deleting = $state(false);

	const isDraft = $derived(quote?.status === 'draft');
	const canResend = $derived(quote?.status === 'sent' || quote?.status === 'viewed');

	const subtotal = $derived(
		lineItems.reduce((s, li) => {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);
	const taxRateNum = $derived.by(() => {
		const n = Number(taxRateDraft);
		return Number.isFinite(n) ? n / 100 : 0;
	});
	const taxAmount = $derived(Math.round(subtotal * taxRateNum * 100) / 100);
	const total = $derived(Math.round((subtotal + subtotal * taxRateNum) * 100) / 100);

	const dirty = $derived.by(() => {
		if (!quote) return false;
		if (titleDraft.trim() !== quote.title) return true;
		if (notesDraft.trim() !== (quote.notes ?? '')) return true;
		const currentTaxPct = String(Number(quote.tax_rate) * 100);
		if (Number(taxRateDraft) !== Number(currentTaxPct)) return true;
		const orig = quote.line_items;
		if (lineItems.length !== orig.length) return true;
		for (let i = 0; i < lineItems.length; i++) {
			const a = lineItems[i];
			const b = orig[i];
			if (a.description !== b.description) return true;
			if (Number(a.quantity) !== Number(b.quantity)) return true;
			if (Number(a.unit_price) !== Number(b.unit_price)) return true;
		}
		return false;
	});

	async function refresh() {
		await quotesStore.loadDetail(data.id, true);
		const latest = quotesStore.getDetail(data.id);
		if (latest) {
			initDrafts(latest);
			quotesStore.update({
				id: latest.id,
				status: latest.status,
				total: latest.total,
				sent_at: latest.sent_at,
				viewed_at: latest.viewed_at,
				accepted_at: latest.accepted_at,
				declined_at: latest.declined_at
			});
		}
	}

	function onTemplateApply(items: QuoteLineDraft[]) {
		lineItems = [...lineItems, ...items];
	}

	async function save() {
		if (!quote || !isDraft) return;
		if (!titleDraft.trim()) {
			toast.error('Title is required');
			return;
		}
		for (const li of lineItems) {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!li.description.trim()) {
				toast.error('Every line item needs a description');
				return;
			}
			if (!Number.isFinite(q) || q <= 0) {
				toast.error('Every line item needs a quantity greater than 0');
				return;
			}
			if (!Number.isFinite(p) || p < 0) {
				toast.error('Unit price cannot be negative');
				return;
			}
		}

		saving = true;
		try {
			const res = await fetch(`/api/quotes/${quote.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: titleDraft.trim(),
					tax_rate: Number.isFinite(taxRateNum) ? taxRateNum : 0,
					notes: notesDraft.trim() || null,
					line_items: lineItems.map((li, idx) => ({
						description: li.description.trim(),
						quantity: Number(li.quantity),
						unit_price: Number(li.unit_price),
						position: idx
					}))
				})
			});
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to save');
				return;
			}
			await refresh();
			const latest = quotesStore.getDetail(data.id);
			if (latest) quotesStore.update({ id: latest.id, total: latest.total });
			toast.success('Quote saved');
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!quote) return;
		if (!confirm('Delete this quote? This cannot be undone.')) return;
		deleting = true;
		try {
			const res = await fetch(`/api/quotes/${quote.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Failed to delete');
				return;
			}
			quotesStore.remove(quote.id);
			toast.success('Quote deleted');
			goto('/quotes');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{quote ? quote.quote_number_display : 'Quote'}</title></svelte:head>

{#if showSkeleton}
	<PageWrapper title="Quote">
		<div class="grid gap-4">
			<div class="rounded-xl border border-border bg-card p-4">
				<SkeletonLoader lines={3} />
			</div>
			<div class="rounded-xl border border-border bg-card p-4">
				<SkeletonLoader lines={4} />
			</div>
			<div class="rounded-xl border border-border bg-card p-4">
				<SkeletonLoader lines={5} />
			</div>
		</div>
	</PageWrapper>
{:else if !quote}
	<PageWrapper title="Quote">
		<p class="text-sm text-destructive">{detailError ?? 'Not found'}</p>
	</PageWrapper>
{:else}
	{@const q = quote}
	<PageWrapper title={q.quote_number_display}>
		{#snippet actions()}
			{#if isDraft}
				<JetEngineButton
					label="Save"
					loadingLabel="Saving…"
					successLabel="Saved"
					state={saving ? 'loading' : 'idle'}
					disabled={!dirty}
					onclick={save}
				>
					{#snippet icon()}<Save class="h-4 w-4" />{/snippet}
				</JetEngineButton>
				<Button
					variant="outline"
					onclick={() => (sendOpen = true)}
					disabled={lineItems.length === 0 || dirty}
				>
					<Send class="mr-1 h-4 w-4" />Send
				</Button>
			{:else if canResend}
				<Button variant="outline" onclick={() => (sendOpen = true)}>
					<Send class="mr-1 h-4 w-4" />Resend
				</Button>
			{/if}
			<DownloadPdfButton quoteId={q.id} />
		{/snippet}

		<div class="grid gap-4">
			<div class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<QuoteStatusBadge status={q.status} />
							{#if q.viewed_at}
								<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
									<Eye class="h-3 w-3" />{q.view_count} view{q.view_count === 1 ? '' : 's'}
								</span>
							{/if}
						</div>
						<p class="mt-2 text-sm text-muted-foreground">{q.contact_name}</p>
						<p class="text-xs text-muted-foreground">
							{q.contact_phone}{q.contact_email ? ` · ${q.contact_email}` : ''}
						</p>
					</div>
					{#if isDraft}
						<button
							type="button"
							onclick={remove}
							disabled={deleting}
							class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
							aria-label="Delete quote"
						>
							{#if deleting}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Trash2 class="h-4 w-4" />
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<div class="grid gap-2 rounded-xl border border-border bg-card p-4">
				<Label for="quote-title">Title</Label>
				<Input id="quote-title" bind:value={titleDraft} disabled={!isDraft} />
				<Label for="quote-tax" class="mt-2">Tax rate (%)</Label>
				<Input
					id="quote-tax"
					type="number"
					inputmode="decimal"
					min="0"
					max="100"
					step="0.01"
					bind:value={taxRateDraft}
					disabled={!isDraft}
				/>
				<Label for="quote-notes" class="mt-2">Notes</Label>
				<Textarea id="quote-notes" bind:value={notesDraft} rows={3} disabled={!isDraft} />
			</div>

			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold">Line items</h2>
					{#if isDraft}
						<Button variant="outline" size="sm" onclick={() => (templateOpen = true)}>
							<FileText class="mr-1 h-4 w-4" />Apply template
						</Button>
					{/if}
				</div>
				<LineItemEditor bind:lineItems readonly={!isDraft} />
			</div>

			<QuoteTotalsCard
				subtotal={isDraft ? subtotal.toFixed(2) : q.subtotal}
				tax_rate={isDraft ? taxRateNum.toFixed(4) : q.tax_rate}
				tax_amount={isDraft ? taxAmount.toFixed(2) : q.tax_amount}
				total={isDraft ? total.toFixed(2) : q.total}
				deposit_required={q.deposit_required}
				deposit_amount={q.deposit_amount}
			/>

			<AttachmentList
				parentFk={{ quote_id: q.id }}
				purposeTag="quote_attachment"
				canUpload={member().can_upload_files}
				canDelete={member().can_upload_files}
			/>
		</div>

		<SendQuoteDialog
			bind:open={sendOpen}
			quoteId={q.id}
			quoteNumberDisplay={q.quote_number_display}
			title={q.title}
			total={q.total}
			contactName={q.contact_name}
			contactEmail={q.contact_email}
			contactPhone={q.contact_phone}
			mode={isDraft ? 'send' : 'resend'}
			onSent={() => {
				void refresh();
			}}
		/>

		<ApplyTemplateDialog bind:open={templateOpen} onApply={onTemplateApply} />
	</PageWrapper>
{/if}
