<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import JetEngineButton from '$lib/components/shared/JetEngineButton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import QuoteStatusBadge from '$lib/components/quotes/QuoteStatusBadge.svelte';
	import QuoteHistoryTimeline from '$lib/components/quotes/QuoteHistoryTimeline.svelte';
	import QuoteTotalsCard from '$lib/components/quotes/QuoteTotalsCard.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import QuoteProgressStrip from '$lib/components/quotes/QuoteProgressStrip.svelte';
	import ServiceAddressPicker from '$lib/components/quotes/ServiceAddressPicker.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/stores/toast.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { getMemberContext } from '$lib/context/member';
	import {
		AlertTriangle,
		BookOpen,
		Briefcase,
		Check,
		CircleCheckBig,
		CircleX,
		Clock,
		Copy,
		CreditCard,
		Download,
		Eye,
		FileText,
		Lock,
		MapPin,
		MessageSquare,
		MoreHorizontal,
		PenLine,
		Phone,
		Receipt,
		Save,
		Send,
		Trash2,
		Loader2
	} from '@lucide/svelte';
	import { Calendar } from '$lib/components/ui/calendar';
	import { formatCurrency } from '$lib/utils/format';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type {
		QuoteDetail,
		QuoteLineDraft,
		QuoteLineItemRow,
		QuoteLinePhoto
	} from '$lib/types/quotes';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const quote = $derived(quotesStore.getDetail(data.id));
	const detailStatus = $derived(quotesStore.getDetailStatus(data.id));
	const detailError = $derived(quotesStore.getDetailError(data.id));
	const showSkeleton = $derived(!quote && detailStatus !== 'error');

	function toDrafts(rows: QuoteLineItemRow[]): QuoteLineDraft[] {
		return rows.map((li) => ({
			client_id: li.line_key ?? li.id,
			line_key: li.line_key ?? li.id,
			description: li.description,
			details: li.details ?? null,
			quantity: li.quantity,
			unit: li.unit ?? '',
			section_label: li.section_label ?? null,
			is_optional: li.is_optional ?? false,
			unit_price: li.unit_price,
			unit_cost: li.unit_cost ?? null,
			source_catalog_item_id: li.source_catalog_item_id ?? null
		}));
	}

	let lineItems = $state<QuoteLineDraft[]>([]);
	// Per-line photos for this quote, grouped by line_key, loaded independently of the detail.
	let linePhotos = $state<Record<string, QuoteLinePhoto[]>>({});
	let titleDraft = $state('');
	let serviceAddressIdDraft = $state<string | null>(null);
	let taxRateDraft = $state('0');
	let notesDraft = $state('');
	let internalNotesDraft = $state('');
	let expiresAtDraft = $state('');
	let depositRequiredDraft = $state(false);
	let depositTypeDraft = $state<'fixed' | 'percent'>('fixed');
	let depositAmountDraft = $state('');
	let depositPercentDraft = $state('');
	let discountTypeDraft = $state<'none' | 'fixed' | 'percent'>('none');
	let discountValueDraft = $state('');
	let discountLabelDraft = $state('');
	let initializedForId = $state<string | null>(null);

	function initDrafts(q: QuoteDetail) {
		lineItems = toDrafts(q.line_items);
		titleDraft = q.title;
		serviceAddressIdDraft = q.service_address_id ?? null;
		taxRateDraft = String(Number(q.tax_rate) * 100);
		notesDraft = q.notes ?? '';
		internalNotesDraft = q.internal_notes ?? '';
		expiresAtDraft = q.expires_at ? q.expires_at.slice(0, 10) : '';
		depositRequiredDraft = q.deposit_required;
		depositTypeDraft = (q.deposit_type as 'fixed' | 'percent') ?? 'fixed';
		depositAmountDraft = q.deposit_amount ?? '';
		depositPercentDraft = q.deposit_percent ?? '';
		discountTypeDraft = (q.discount_type as 'none' | 'fixed' | 'percent') ?? 'none';
		discountValueDraft = q.discount_value ?? '';
		discountLabelDraft = q.discount_label ?? '';
		initializedForId = q.id;
	}

	$effect(() => {
		void quotesStore.loadDetail(data.id);
	});

	async function loadLinePhotos() {
		try {
			const res = await fetch(`/api/quotes/${data.id}/line-photos`);
			if (!res.ok) return;
			const body = (await res.json()) as {
				data: { id: string; line_key: string | null; thumb_url: string; full_url: string }[];
			};
			const map: Record<string, QuoteLinePhoto[]> = {};
			for (const p of body.data) {
				if (!p.line_key) continue;
				(map[p.line_key] ??= []).push({
					id: p.id,
					thumb_url: p.thumb_url,
					full_url: p.full_url
				});
			}
			linePhotos = map;
		} catch {
			// non-fatal — line photos just won't show
		}
	}

	$effect(() => {
		if (data.id) void loadLinePhotos();
	});

	$effect(() => {
		if (quote && initializedForId !== quote.id) {
			initDrafts(quote);
		}
	});

	let sendOpen = $state(false);
	let templateOpen = $state(false);
	let catalogOpen = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let converting = $state(false);

	const isAccepted = $derived(quote?.status === 'accepted');
	const isDraft = $derived(quote?.status === 'draft');
	const isExpired = $derived(quote?.status === 'expired');
	const isChangesRequested = $derived(quote?.status === 'changes_requested');
	const isEditable = $derived(isDraft || isChangesRequested);
	const canResend = $derived(
		quote?.status === 'sent' || quote?.status === 'viewed' || quote?.status === 'changes_requested'
	);
	const depositLocked = $derived((quote?.deposit_paid_amount ?? 0) > 0);
	// Offline accept/decline only applies while the quote is out with the client and not yet
	// resolved — mirrors the mark-accepted/mark-declined endpoints' allowed statuses.
	const isMarkable = $derived(
		quote?.status === 'sent' || quote?.status === 'viewed' || quote?.status === 'changes_requested'
	);
	// Accepted quotes are signed/paid financial records — protected from deletion (mirrors the
	// list view). Everything else can be soft-deleted to clear clutter.
	const isDeletable = $derived(!!quote && quote.status !== 'accepted');

	const canEditPerm = $derived(member().can_edit_quotes);
	const canSendPerm = $derived(member().can_send_quotes);
	const canDeletePerm = $derived(member().can_delete_quotes);
	const canConvertPerm = $derived(member().can_create_invoices);
	const canCreatePerm = $derived(member().can_create_quotes);
	const canConvertToJobPerm = $derived(member().can_view_full_pipeline);

	// Base subtotal excludes optional add-ons (they only count if the customer selects them).
	const subtotal = $derived(
		lineItems.reduce((s, li) => {
			if (li.is_optional) return s;
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);
	// Optional add-ons (draft preview) for the totals card while editing.
	const draftOptionalItems = $derived(
		lineItems
			.filter((li) => li.is_optional)
			.map((li) => {
				const q = Number(li.quantity);
				const p = Number(li.unit_price);
				const t = Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) / 100 : 0;
				return { description: li.description, total: t };
			})
	);
	// Once accepted, the frozen accepted_* figures (base + chosen add-ons) are authoritative.
	const isAcceptedWithTotals = $derived(
		!!quote && quote.status === 'accepted' && quote.accepted_total != null
	);
	// Optional add-on lines on the saved quote, with whether the customer chose each.
	const quoteOptionalItems = $derived(
		(quote?.line_items ?? [])
			.filter((li) => li.is_optional)
			.map((li) => ({
				description: li.description,
				total: Number(li.total),
				selected: li.accepted_selected ?? false
			}))
	);
	// What the totals card lists as "optional add-ons (not included)". Hidden once accepted
	// (selections are shown in their own breakdown below).
	const cardOptionalItems = $derived(
		isEditable
			? draftOptionalItems
			: isAcceptedWithTotals
				? []
				: quoteOptionalItems.map((o) => ({ description: o.description, total: o.total }))
	);
	const taxRateNum = $derived.by(() => {
		const n = Number(taxRateDraft);
		return Number.isFinite(n) ? n / 100 : 0;
	});
	// Quote-level discount preview (live). Applies to the base subtotal before tax. Fixed is
	// clamped to the subtotal; percent capped at 100. Server (recalcQuoteTotals) is authoritative.
	const discountValueNum = $derived.by(() => {
		const n = Number(discountValueDraft);
		return Number.isFinite(n) && n > 0 ? n : NaN;
	});
	const discountAmount = $derived.by(() => {
		if (discountTypeDraft === 'none' || !Number.isFinite(discountValueNum)) return 0;
		if (discountTypeDraft === 'percent') {
			return Math.round(subtotal * Math.min(discountValueNum, 100)) / 100;
		}
		return Math.min(discountValueNum, subtotal);
	});
	const discountedSubtotal = $derived(Math.round((subtotal - discountAmount) * 100) / 100);
	const taxAmount = $derived(Math.round(discountedSubtotal * taxRateNum * 100) / 100);
	const total = $derived(
		Math.round((discountedSubtotal + discountedSubtotal * taxRateNum) * 100) / 100
	);
	// Discount actually applied on an accepted quote (base + chosen add-ons), derived from the
	// frozen accepted figures so it always reconciles with the accepted total shown.
	const acceptedDiscount = $derived.by(() => {
		if (!isAcceptedWithTotals || !quote) return 0;
		const sub = Number(quote.accepted_subtotal ?? 0);
		const tax = Number(quote.accepted_tax_amount ?? 0);
		const tot = Number(quote.accepted_total ?? 0);
		return Math.round((sub - (tot - tax)) * 100) / 100;
	});
	const depositAmountNum = $derived.by(() => {
		const n = Number(depositAmountDraft);
		return Number.isFinite(n) ? n : NaN;
	});
	const depositPercentNum = $derived.by(() => {
		const n = Number(depositPercentDraft);
		return Number.isFinite(n) && n > 0 ? n : NaN;
	});
	const depositPreviewAmount = $derived.by(() => {
		if (!depositRequiredDraft || depositTypeDraft !== 'percent') return null;
		if (!Number.isFinite(depositPercentNum) || total <= 0) return null;
		return Math.round(((total * depositPercentNum) / 100) * 100) / 100;
	});

	const dirty = $derived.by(() => {
		if (!quote) return false;
		if (titleDraft.trim() !== quote.title) return true;
		if ((serviceAddressIdDraft ?? null) !== (quote.service_address_id ?? null)) return true;
		if (notesDraft.trim() !== (quote.notes ?? '')) return true;
		if (internalNotesDraft.trim() !== (quote.internal_notes ?? '')) return true;
		const currentExpiry = quote.expires_at ? quote.expires_at.slice(0, 10) : '';
		if (expiresAtDraft !== currentExpiry) return true;
		const currentTaxPct = String(Number(quote.tax_rate) * 100);
		if (Number(taxRateDraft) !== Number(currentTaxPct)) return true;
		if (depositRequiredDraft !== quote.deposit_required) return true;
		const origType = (quote.deposit_type as 'fixed' | 'percent') ?? 'fixed';
		if (depositTypeDraft !== origType) return true;
		if (depositTypeDraft === 'percent') {
			const origPct = quote.deposit_percent ? Number(quote.deposit_percent) : NaN;
			const draftPct = depositRequiredDraft ? depositPercentNum : NaN;
			if (Number.isFinite(origPct) !== Number.isFinite(draftPct)) return true;
			if (Number.isFinite(origPct) && Number.isFinite(draftPct) && origPct !== draftPct)
				return true;
		} else {
			const origDeposit = quote.deposit_amount ? Number(quote.deposit_amount) : NaN;
			const draftDeposit = depositRequiredDraft ? depositAmountNum : NaN;
			if (Number.isFinite(origDeposit) !== Number.isFinite(draftDeposit)) return true;
			if (
				Number.isFinite(origDeposit) &&
				Number.isFinite(draftDeposit) &&
				origDeposit !== draftDeposit
			)
				return true;
		}
		const origDiscType = (quote.discount_type as 'none' | 'fixed' | 'percent') ?? 'none';
		if (discountTypeDraft !== origDiscType) return true;
		if (discountTypeDraft !== 'none') {
			const origVal = quote.discount_value ? Number(quote.discount_value) : NaN;
			const draftVal = discountValueNum;
			if (Number.isFinite(origVal) !== Number.isFinite(draftVal)) return true;
			if (Number.isFinite(origVal) && Number.isFinite(draftVal) && origVal !== draftVal)
				return true;
			if (discountLabelDraft.trim() !== (quote.discount_label ?? '')) return true;
		}
		const orig = quote.line_items;
		if (lineItems.length !== orig.length) return true;
		for (let i = 0; i < lineItems.length; i++) {
			const a = lineItems[i];
			const b = orig[i];
			if (a.description !== b.description) return true;
			if ((a.details?.trim() || '') !== (b.details ?? '')) return true;
			if (Number(a.quantity) !== Number(b.quantity)) return true;
			if ((a.unit?.trim() || '') !== (b.unit ?? '')) return true;
			if ((a.section_label?.trim() || '') !== (b.section_label ?? '')) return true;
			if ((a.is_optional ?? false) !== (b.is_optional ?? false)) return true;
			if (Number(a.unit_price) !== Number(b.unit_price)) return true;
		}
		return false;
	});

	async function refresh() {
		await quotesStore.loadDetail(data.id, true);
		void loadLinePhotos();
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

	let SendQuoteDialog = $state<
		typeof import('$lib/components/quotes/SendQuoteDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!sendOpen || SendQuoteDialog) return;
		void import('$lib/components/quotes/SendQuoteDialog.svelte').then((m) => {
			SendQuoteDialog = m.default;
		});
	});

	let ApplyTemplateDialog = $state<
		typeof import('$lib/components/quotes/ApplyTemplateDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!templateOpen || ApplyTemplateDialog) return;
		void import('$lib/components/quotes/ApplyTemplateDialog.svelte').then((m) => {
			ApplyTemplateDialog = m.default;
		});
	});

	async function save() {
		if (!quote || !isEditable) return;
		if (!titleDraft.trim()) {
			toast.error('Title is required');
			return;
		}
		for (const li of lineItems) {
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!li.description.trim()) {
				toast.error('Every line item needs a title');
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
		if (discountTypeDraft !== 'none' && !depositLocked) {
			if (!Number.isFinite(discountValueNum) || discountValueNum <= 0) {
				toast.error(
					discountTypeDraft === 'percent'
						? 'Enter a discount percentage greater than 0'
						: 'Enter a discount amount greater than 0'
				);
				return;
			}
			if (discountTypeDraft === 'percent' && discountValueNum > 100) {
				toast.error('Discount percentage cannot exceed 100');
				return;
			}
		}
		if (depositRequiredDraft && !depositLocked) {
			if (depositTypeDraft === 'percent') {
				if (
					!Number.isFinite(depositPercentNum) ||
					depositPercentNum <= 0 ||
					depositPercentNum >= 100
				) {
					toast.error('Enter a percentage between 0.01 and 99.99');
					return;
				}
			} else {
				if (!Number.isFinite(depositAmountNum) || depositAmountNum <= 0) {
					toast.error('Enter a deposit amount');
					return;
				}
				if (total > 0 && depositAmountNum >= total) {
					toast.error('Deposit must be less than the quote total');
					return;
				}
			}
		}

		saving = true;
		try {
			const patchBody: Record<string, unknown> = {
				title: titleDraft.trim(),
				service_address_id: serviceAddressIdDraft,
				tax_rate: Number.isFinite(taxRateNum) ? taxRateNum : 0,
				notes: notesDraft.trim() || null,
				internal_notes: internalNotesDraft.trim() || null,
				expires_at: expiresAtDraft ? `${expiresAtDraft}T23:59:59.000Z` : null,
				line_items: lineItems.map((li, idx) => ({
					line_key: li.line_key,
					description: li.description.trim(),
					details: li.details?.trim() || null,
					quantity: Number(li.quantity),
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					is_optional: li.is_optional ?? false,
					unit_price: Number(li.unit_price),
					unit_cost:
						li.unit_cost !== undefined && li.unit_cost !== null ? Number(li.unit_cost) : null,
					source_catalog_item_id: li.source_catalog_item_id ?? null,
					position: idx
				}))
			};
			if (!depositLocked) {
				patchBody.discount_type = discountTypeDraft;
				if (discountTypeDraft === 'none') {
					patchBody.discount_value = null;
					patchBody.discount_label = null;
				} else {
					patchBody.discount_value = discountValueNum;
					patchBody.discount_label = discountLabelDraft.trim() || null;
				}
				patchBody.deposit_required = depositRequiredDraft;
				patchBody.deposit_type = depositTypeDraft;
				if (depositTypeDraft === 'percent') {
					patchBody.deposit_percent = depositRequiredDraft ? depositPercentNum : null;
					patchBody.deposit_amount = null;
				} else {
					patchBody.deposit_amount = depositRequiredDraft ? depositAmountNum : null;
					patchBody.deposit_percent = null;
				}
			}
			const res = await fetch(`/api/quotes/${quote.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patchBody)
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
		if (!quote || deleting) return;
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
			confirmDeleteOpen = false;
			goto('/quotes');
		} finally {
			deleting = false;
		}
	}

	let duplicating = $state(false);
	async function duplicate() {
		if (!quote || duplicating) return;
		duplicating = true;
		try {
			const res = await fetch(`/api/quotes/${quote.id}/duplicate`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to duplicate');
				return;
			}
			const d = body.data as { id: string; quote_number_display: string };
			toast.success(`${d.quote_number_display} created as a draft`);
			goto(`/quotes/${d.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			duplicating = false;
		}
	}

	// "Preview as client" opens the real client-facing web page (the same view a customer sees
	// after getting the link) in a new tab — available even on drafts, before sending.
	function previewAsClient() {
		if (!quote) return;
		window.open(`/quote-preview/${quote.id}`, '_blank', 'noopener');
	}

	// Download PDF generates the document and saves the file.
	let downloadingPdf = $state(false);
	async function downloadPdf() {
		if (!quote || downloadingPdf) return;
		downloadingPdf = true;
		try {
			const res = await fetch(`/api/quotes/${quote.id}/pdf`, { method: 'POST' });
			const body = await res.json().catch(() => null);
			if (!res.ok || !body?.data?.url) {
				toast.error(body?.error ?? 'Failed to generate PDF');
				return;
			}
			const a = document.createElement('a');
			a.href = body.data.url as string;
			a.download = `${quote.quote_number_display}.pdf`;
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
		} finally {
			downloadingPdf = false;
		}
	}

	// Offline accept/decline — reuses the same dialog the list view uses so the contractor can
	// record a phone/in-person yes-or-no (and pick approved add-ons) without leaving the quote.
	let offlineMode = $state<'accepted' | 'declined'>('accepted');
	let offlineOpen = $state(false);
	let OfflineDialog = $state<
		typeof import('$lib/components/quotes/QuoteOfflineResultDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!offlineOpen || OfflineDialog) return;
		void import('$lib/components/quotes/QuoteOfflineResultDialog.svelte').then((m) => {
			OfflineDialog = m.default;
		});
	});
	function openOffline(mode: 'accepted' | 'declined') {
		offlineMode = mode;
		offlineOpen = true;
	}

	// Delete confirmation (destructive + irreversible) gets an explicit dialog, not a native prompt.
	let confirmDeleteOpen = $state(false);
	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!confirmDeleteOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	async function convertToInvoice() {
		if (!quote) return;
		converting = true;
		try {
			const res = await fetch(`/api/quotes/${quote.id}/convert-to-invoice`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to convert');
				return;
			}
			const d = body.data as {
				id: string;
				invoice_number_display: string;
				already_existed: boolean;
			};
			if (d.already_existed) {
				toast.info(`Invoice ${d.invoice_number_display} already exists`);
			} else {
				toast.success(`Invoice ${d.invoice_number_display} created`);
			}
			goto(`/invoices/${d.id}`);
		} catch {
			toast.error('Network error');
		} finally {
			converting = false;
		}
	}

	let extending = $state(false);
	async function extendQuote(days: 7 | 14 | 30) {
		if (!quote) return;
		extending = true;
		try {
			const res = await fetch(`/api/quotes/${quote.id}/extend`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ days })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to extend');
				return;
			}
			await refresh();
			toast.success(`Quote extended ${days} days`);
		} catch {
			toast.error('Network error');
		} finally {
			extending = false;
		}
	}

	function formatRequestedAt(iso: string): string {
		const d = new Date(iso);
		const now = Date.now();
		const diff = Math.max(0, now - d.getTime());
		const min = 60_000;
		const hr = 60 * min;
		const day = 24 * hr;
		if (diff < min) return 'just now';
		if (diff < hr) return `${Math.floor(diff / min)} min ago`;
		if (diff < day) return `${Math.floor(diff / hr)} hr ago`;
		if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
		return d.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function fmtDate(iso: string) {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>{quote ? quote.quote_number_display : 'Quote'}</title></svelte:head>

{#if showSkeleton}
	<PageWrapper title="Quote" back="/quotes">
		<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
			<div class="space-y-4">
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={3} />
				</div>
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={4} />
				</div>
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={5} />
				</div>
			</div>
			<div class="space-y-4">
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<SkeletonLoader lines={4} />
				</div>
			</div>
		</div>
	</PageWrapper>
{:else if !quote}
	<PageWrapper title="Quote" back="/quotes">
		<p class="text-sm text-destructive">{detailError ?? 'Not found'}</p>
	</PageWrapper>
{:else}
	{@const q = quote}
	<PageWrapper title={q.quote_number_display} back="/quotes">
		{#snippet actions()}
			{#if isEditable}
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
				{#if canSendPerm}
					<Button
						variant="outline"
						onclick={() => (sendOpen = true)}
						disabled={lineItems.length === 0 || dirty}
					>
						<Send class="mr-1 h-4 w-4" />{isDraft ? 'Send' : 'Resend'}
					</Button>
				{/if}
			{:else if canResend && canSendPerm}
				<Button variant="outline" onclick={() => (sendOpen = true)}>
					<Send class="mr-1 h-4 w-4" />Resend
				</Button>
			{/if}
			{#if isAccepted && canConvertPerm}
				<JetEngineButton
					label="Create invoice"
					loadingLabel="Creating…"
					successLabel="Created"
					state={converting ? 'loading' : 'idle'}
					onclick={convertToInvoice}
				>
					{#snippet icon()}<Receipt class="h-4 w-4" />{/snippet}
				</JetEngineButton>
			{/if}
			{@const showMark = isMarkable && canEditPerm}
			{@const showDelete = isDeletable && canDeletePerm}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-transparent text-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/70 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-[hsl(var(--brand-light)/0.4)] dark:hover:border-[hsl(var(--brand-light)/0.7)]"
					aria-label="More actions"
				>
					<MoreHorizontal class="h-4 w-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={previewAsClient}>
						<Eye class="h-4 w-4" /> Preview as client
					</DropdownMenu.Item>
					<DropdownMenu.Item closeOnSelect={false} onclick={downloadPdf} disabled={downloadingPdf}>
						{#if downloadingPdf}
							<Loader2 class="h-4 w-4 animate-spin" /> Preparing PDF…
						{:else}
							<Download class="h-4 w-4" /> Download PDF
						{/if}
					</DropdownMenu.Item>
					{#if showMark}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => openOffline('accepted')}>
							<CircleCheckBig class="h-4 w-4" /> Mark as approved
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => openOffline('declined')}>
							<CircleX class="h-4 w-4" /> Mark as declined
						</DropdownMenu.Item>
					{/if}
					{#if canConvertToJobPerm && q.status !== 'declined' && q.status !== 'expired'}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => goto(`/jobs/new?from_quote=${q.id}`)}>
							<Briefcase class="h-4 w-4" /> Convert to job
						</DropdownMenu.Item>
					{/if}
					{#if canCreatePerm}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={duplicate} disabled={duplicating}>
							<Copy class="h-4 w-4" /> Duplicate
						</DropdownMenu.Item>
					{/if}
					{#if showDelete}
						<DropdownMenu.Separator />
						<DropdownMenu.Item
							class="text-destructive focus:bg-destructive/10 focus:text-destructive"
							onclick={() => (confirmDeleteOpen = true)}
						>
							<Trash2 class="h-4 w-4" /> Delete quote
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/snippet}

		<div class="grid gap-6 lg:grid-cols-[1fr_360px]">
			<!-- ── LEFT COLUMN ─────────────────────────────────── -->
			<div class="space-y-4">
				<!-- Progress strip (build stage) -->
				{#if isEditable}
					<div class="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card">
						<QuoteProgressStrip current="build" />
					</div>
				{/if}

				<!-- Alert: changes requested -->
				{#if q.active_change_request}
					<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-sm">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300"
							>
								<MessageSquare class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<p class="text-sm font-semibold text-amber-800 dark:text-amber-200">
										Client requested changes
									</p>
									<span class="shrink-0 text-xs text-amber-700/80 dark:text-amber-300/80">
										{formatRequestedAt(q.active_change_request.requested_at)}
									</span>
								</div>
								<p
									class="mt-1 whitespace-pre-wrap text-sm text-amber-900/90 dark:text-amber-100/90"
								>
									{q.active_change_request.message}
								</p>
								<p class="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
									Update the quote below and re-send. The request will be marked resolved
									automatically.
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Alert: expired -->
				{#if isExpired}
					<div class="rounded-xl border border-zinc-500/30 bg-zinc-500/10 p-4 shadow-sm">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-500/20 text-zinc-700 dark:text-zinc-300"
							>
								<Clock class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
									This quote has expired
								</p>
								<p class="mt-1 text-sm text-zinc-700/90 dark:text-zinc-300/90">
									{#if q.expires_at}
										Validity passed {fmtDate(q.expires_at)}.
									{/if}
									The deal stays in your pipeline — revive it below.
								</p>
								<div class="mt-3 flex flex-wrap items-center gap-2">
									<span class="text-xs font-medium text-muted-foreground">Extend</span>
									<Button
										size="sm"
										variant="outline"
										disabled={extending}
										onclick={() => extendQuote(7)}>+7 days</Button
									>
									<Button size="sm" disabled={extending} onclick={() => extendQuote(14)}>
										{#if extending}<Loader2 class="mr-1 h-4 w-4 animate-spin" />{/if}+14 days
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={extending}
										onclick={() => extendQuote(30)}>+30 days</Button
									>
									<a
										href="tel:{q.contact_phone}"
										class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
									>
										<Phone class="h-4 w-4" />Call
									</a>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<!-- Document header card -->
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<!-- Status + view count -->
							<div class="flex flex-wrap items-center gap-2">
								<QuoteStatusBadge status={q.status} version={q.current_version} />
								{#if q.viewed_at}
									<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
										<Eye class="h-3 w-3" />{q.view_count} view{q.view_count === 1 ? '' : 's'}
									</span>
								{/if}
							</div>

							<!-- Contact -->
							<p class="mt-2 text-base font-semibold text-foreground">{q.contact_name}</p>
							<p class="text-sm text-muted-foreground">
								{q.contact_phone}{q.contact_email ? ` · ${q.contact_email}` : ''}
							</p>
							{#if !q.contact_email}
								<p
									class="mt-1.5 inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
								>
									<AlertTriangle class="h-3 w-3 shrink-0" />No email on file — SMS only
								</p>
							{/if}
							{#if q.service_address && !isEditable}
								<p class="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
									<MapPin class="mt-0.5 h-3.5 w-3.5 shrink-0" />
									<span>
										{[
											q.service_address.address_line_1,
											q.service_address.address_line_2,
											[q.service_address.city, q.service_address.state, q.service_address.zip]
												.filter(Boolean)
												.join(' ')
										]
											.filter(Boolean)
											.join(', ')}
									</span>
								</p>
							{/if}

							<!-- Date row -->
							<div class="mt-3 flex flex-wrap gap-4">
								<div>
									<p class="text-xs text-muted-foreground">Issued</p>
									<p class="text-sm font-medium text-foreground">{fmtDate(q.created_at)}</p>
								</div>
								{#if q.expires_at && !isEditable}
									<div>
										<p class="text-xs text-muted-foreground">Expires</p>
										<p
											class="text-sm font-medium {isExpired
												? 'text-destructive'
												: 'text-foreground'}"
										>
											{fmtDate(q.expires_at)}
										</p>
									</div>
								{/if}
								{#if q.sent_at}
									<div>
										<p class="text-xs text-muted-foreground">Sent</p>
										<p class="text-sm font-medium text-foreground">{fmtDate(q.sent_at)}</p>
									</div>
								{/if}
								{#if q.accepted_at}
									<div>
										<p class="text-xs text-muted-foreground">Accepted</p>
										<p class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
											{fmtDate(q.accepted_at)}
										</p>
									</div>
								{/if}
								{#if q.acceptance_signature_name}
									<div>
										<p class="text-xs text-muted-foreground">Signed by</p>
										<p
											class="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400"
										>
											<PenLine class="h-3.5 w-3.5 shrink-0" />{q.acceptance_signature_name}
										</p>
									</div>
								{/if}
								{#if q.declined_at}
									<div>
										<p class="text-xs text-muted-foreground">Declined</p>
										<p class="text-sm font-medium text-destructive">{fmtDate(q.declined_at)}</p>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Details form card -->
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<h2 class="mb-4 text-sm font-semibold text-foreground">Details</h2>
					<div class="grid gap-4">
						<div class="grid gap-2">
							<Label for="quote-title">Title <span class="text-destructive">*</span></Label>
							<Input id="quote-title" bind:value={titleDraft} disabled={!isEditable} />
						</div>

						{#if isEditable}
							<div class="grid gap-2">
								<Label class="flex items-center gap-1.5">
									<MapPin class="h-3.5 w-3.5 text-muted-foreground" />
									Service address
									<span class="text-xs font-normal text-muted-foreground">(optional)</span>
								</Label>
								<ServiceAddressPicker
									contactId={q.contact_id}
									bind:selectedAddressId={serviceAddressIdDraft}
								/>
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-4">
							<div class="grid gap-2">
								<Label>Valid until</Label>
								<Calendar
									bind:value={expiresAtDraft}
									placeholder="Pick expiry date"
									disabled={!isEditable}
									min={new Date().toISOString().slice(0, 10)}
								/>
							</div>
							<div class="grid gap-2">
								<Label for="quote-tax">Tax rate (%)</Label>
								<Input
									id="quote-tax"
									type="number"
									inputmode="decimal"
									min="0"
									max="100"
									step="0.01"
									bind:value={taxRateDraft}
									disabled={!isEditable}
								/>
							</div>
						</div>
					</div>
				</div>

				<!-- Notes card -->
				<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
					<h2 class="mb-4 text-sm font-semibold text-foreground">Notes</h2>
					<div class="grid gap-4">
						<div class="grid gap-2">
							<Label for="quote-notes">Client notes</Label>
							<p class="text-xs text-muted-foreground -mt-1">
								Visible to the customer on their quote.
							</p>
							<Textarea
								id="quote-notes"
								bind:value={notesDraft}
								rows={3}
								disabled={!isEditable}
								placeholder="e.g. All work includes a 1-year warranty."
							/>
						</div>
						<div class="grid gap-2">
							<Label for="quote-internal-notes" class="flex items-center gap-1.5">
								Internal notes
								<span
									class="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
								>
									<Lock class="h-2.5 w-2.5" />Staff only
								</span>
							</Label>
							<p class="text-xs text-muted-foreground -mt-1">Never shown to the client.</p>
							<Textarea
								id="quote-internal-notes"
								bind:value={internalNotesDraft}
								rows={3}
								disabled={!isEditable}
								placeholder="e.g. Client mentioned tight budget — consider offering phased approach."
							/>
						</div>
					</div>
				</div>

				<!-- Line items -->
				<div class="overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
					<!-- Header strip — title + item count + all item actions in one row -->
					<div class="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
						<div class="flex items-center gap-2">
							<h2 class="text-sm font-semibold text-foreground">Line items</h2>
							{#if lineItems.length > 0}
								<span
									class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
								>
									{lineItems.length}
								</span>
							{/if}
						</div>
						{#if isEditable}
							<div class="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									class="gap-1.5"
									onclick={() => (catalogOpen = true)}
								>
									<BookOpen class="h-4 w-4" /><span class="hidden sm:inline">Price book</span>
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="gap-1.5"
									onclick={() => (templateOpen = true)}
								>
									<FileText class="h-4 w-4" /><span class="hidden sm:inline">Apply template</span>
								</Button>
							</div>
						{/if}
					</div>
					<!-- Body -->
					<div class="p-4">
						<LineItemEditor
							bind:lineItems
							readonly={!isEditable}
							enableCatalog
							enableOptional
							externalCatalogTrigger
							bind:catalogOpen
							enablePhotos
							quoteId={q.id}
							photosByLineKey={linePhotos}
							canEditPhotos={member().can_upload_files}
						/>
					</div>
				</div>
			</div>

			<!-- ── RIGHT SIDEBAR ───────────────────────────────── -->
			<div class="space-y-4 lg:sticky lg:top-24 lg:self-start">
				<!-- Totals -->
				<QuoteTotalsCard
					subtotal={isEditable
						? subtotal.toFixed(2)
						: isAcceptedWithTotals
							? (q.accepted_subtotal ?? q.subtotal)
							: q.subtotal}
					discount_type={q.discount_type}
					discount_value={q.discount_value}
					discount_amount={isEditable
						? discountAmount.toFixed(2)
						: isAcceptedWithTotals
							? acceptedDiscount.toFixed(2)
							: q.discount_amount}
					discount_label={q.discount_label}
					tax_rate={isEditable ? taxRateNum.toFixed(4) : q.tax_rate}
					tax_amount={isEditable
						? taxAmount.toFixed(2)
						: isAcceptedWithTotals
							? (q.accepted_tax_amount ?? q.tax_amount)
							: q.tax_amount}
					total={isEditable
						? total.toFixed(2)
						: isAcceptedWithTotals
							? (q.accepted_total ?? q.total)
							: q.total}
					deposit_required={q.deposit_required}
					deposit_type={q.deposit_type}
					deposit_percent={q.deposit_percent}
					deposit_amount={q.deposit_amount}
					optionalItems={cardOptionalItems}
				/>

				<!-- Discount (editable, before deposit collection) -->
				{#if isEditable && !depositLocked}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<p class="text-sm font-semibold text-foreground">Discount</p>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Applied to the subtotal before tax.
								</p>
							</div>
						</div>
						<!-- Type toggle -->
						<div class="mt-3 flex overflow-hidden rounded-lg border border-border">
							<button
								type="button"
								class="flex-1 py-1.5 text-sm font-medium transition-colors {discountTypeDraft ===
								'none'
									? 'bg-primary text-primary-foreground'
									: 'bg-card text-muted-foreground hover:bg-muted'}"
								onclick={() => (discountTypeDraft = 'none')}
							>
								None
							</button>
							<button
								type="button"
								class="flex-1 border-l border-border py-1.5 text-sm font-medium transition-colors {discountTypeDraft ===
								'fixed'
									? 'bg-primary text-primary-foreground'
									: 'bg-card text-muted-foreground hover:bg-muted'}"
								onclick={() => {
									if (discountTypeDraft === 'percent' && discountAmount > 0) {
										discountValueDraft = discountAmount.toFixed(2);
									}
									discountTypeDraft = 'fixed';
								}}
							>
								$ Off
							</button>
							<button
								type="button"
								class="flex-1 border-l border-border py-1.5 text-sm font-medium transition-colors {discountTypeDraft ===
								'percent'
									? 'bg-primary text-primary-foreground'
									: 'bg-card text-muted-foreground hover:bg-muted'}"
								onclick={() => {
									if (
										discountTypeDraft === 'fixed' &&
										subtotal > 0 &&
										Number.isFinite(discountValueNum) &&
										discountValueNum > 0
									) {
										discountValueDraft = ((discountValueNum / subtotal) * 100).toFixed(1);
									}
									discountTypeDraft = 'percent';
								}}
							>
								% Off
							</button>
						</div>

						{#if discountTypeDraft !== 'none'}
							<div class="mt-3 space-y-3">
								<div class="grid gap-1.5">
									<Label for="discount-value">
										{discountTypeDraft === 'percent' ? 'Percentage' : 'Amount (USD)'}
										<span class="text-destructive">*</span>
									</Label>
									<div class="relative">
										<Input
											id="discount-value"
											type="number"
											inputmode="decimal"
											min="0.01"
											max={discountTypeDraft === 'percent' ? '100' : undefined}
											step="0.01"
											placeholder={discountTypeDraft === 'percent' ? '10' : '0.00'}
											bind:value={discountValueDraft}
											class={discountTypeDraft === 'percent' ? 'pr-8' : ''}
										/>
										{#if discountTypeDraft === 'percent'}
											<span
												class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
												>%</span
											>
										{/if}
									</div>
									{#if discountAmount > 0}
										<p class="text-xs text-muted-foreground">
											−<span class="font-medium text-foreground">${discountAmount.toFixed(2)}</span>
											off ${subtotal.toFixed(2)} subtotal
										</p>
									{:else if subtotal === 0}
										<p class="text-xs text-muted-foreground">
											Add line items to preview the discount.
										</p>
									{/if}
								</div>
								<div class="grid gap-1.5">
									<Label for="discount-label">Label (optional)</Label>
									<Input
										id="discount-label"
										type="text"
										maxlength={60}
										placeholder="e.g. Spring promo"
										bind:value={discountLabelDraft}
									/>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Accepted add-on selections -->
				{#if isAcceptedWithTotals && quoteOptionalItems.length > 0}
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Optional add-ons
						</p>
						<ul class="space-y-1.5 text-sm">
							{#each quoteOptionalItems as item, i (i)}
								<li class="flex items-center justify-between gap-3">
									<span
										class="flex min-w-0 items-center gap-1.5 {item.selected
											? 'text-foreground'
											: 'text-muted-foreground line-through'}"
									>
										{#if item.selected}
											<Check class="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
										{:else}
											<span class="h-3.5 w-3.5 shrink-0"></span>
										{/if}
										<span class="truncate">{item.description || 'Untitled'}</span>
									</span>
									<span
										class="shrink-0 tabular-nums {item.selected ? '' : 'text-muted-foreground'}"
									>
										{formatCurrency(item.total)}
									</span>
								</li>
							{/each}
						</ul>
						<p class="mt-2 text-xs text-muted-foreground">
							The customer's selections are included in the accepted total above.
						</p>
					</div>
				{/if}

				<!-- Deposit section -->
				{#if q.deposit_paid_amount > 0 && q.deposit_amount}
					<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
							>
								<Check class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
									Deposit received
								</p>
								<p class="mt-1 text-sm text-emerald-900/90 dark:text-emerald-100/90">
									{formatCurrency(q.deposit_amount)}
									{#if q.deposit_paid_at}
										· paid {new Date(q.deposit_paid_at).toLocaleDateString('en-US')}
									{/if}
								</p>
							</div>
						</div>
					</div>
				{:else if q.deposit_required && q.deposit_amount && !depositLocked}
					<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
						<div class="flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300"
							>
								<CreditCard class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold text-amber-800 dark:text-amber-200">
									Deposit pending
								</p>
								<p class="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
									{formatCurrency(q.deposit_amount)} requested — awaiting client payment.
								</p>
							</div>
						</div>
					</div>
				{:else if !depositLocked}
					<!-- Deposit toggle (only when editable or no deposit collected) -->
					<div class="rounded-xl border border-border/60 bg-card p-4 shadow-card">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<p class="text-sm font-semibold text-foreground">Request a deposit</p>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Client pays online after accepting.
								</p>
							</div>
							<Switch
								id="deposit-toggle"
								bind:checked={depositRequiredDraft}
								disabled={!isEditable}
							/>
						</div>
						{#if depositRequiredDraft}
							<div class="mt-3 space-y-3">
								<!-- Type toggle -->
								<div class="flex overflow-hidden rounded-lg border border-border">
									<button
										type="button"
										disabled={!isEditable}
										class="flex-1 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 {depositTypeDraft ===
										'fixed'
											? 'bg-primary text-primary-foreground'
											: 'bg-card text-muted-foreground hover:bg-muted'}"
										onclick={() => {
											if (depositTypeDraft === 'percent' && depositPreviewAmount) {
												depositAmountDraft = depositPreviewAmount.toFixed(2);
											}
											depositTypeDraft = 'fixed';
										}}
									>
										Fixed ($)
									</button>
									<button
										type="button"
										disabled={!isEditable}
										class="flex-1 border-l border-border py-1.5 text-sm font-medium transition-colors disabled:opacity-50 {depositTypeDraft ===
										'percent'
											? 'bg-primary text-primary-foreground'
											: 'bg-card text-muted-foreground hover:bg-muted'}"
										onclick={() => {
											if (
												depositTypeDraft === 'fixed' &&
												total > 0 &&
												Number.isFinite(depositAmountNum) &&
												depositAmountNum > 0
											) {
												depositPercentDraft = ((depositAmountNum / total) * 100).toFixed(1);
											}
											depositTypeDraft = 'percent';
										}}
									>
										Percent (%)
									</button>
								</div>

								{#if depositTypeDraft === 'fixed'}
									<div class="grid gap-1.5">
										<Label for="deposit-amount">
											Amount (USD) <span class="text-destructive">*</span>
										</Label>
										<Input
											id="deposit-amount"
											type="number"
											inputmode="decimal"
											min="0.01"
											step="0.01"
											placeholder="0.00"
											bind:value={depositAmountDraft}
											disabled={!isEditable}
										/>
										{#if isEditable && total > 0 && Number.isFinite(depositAmountNum) && depositAmountNum >= total}
											<p class="text-xs text-destructive">Must be less than the quote total.</p>
										{/if}
									</div>
								{:else}
									<div class="grid gap-1.5">
										<Label for="deposit-percent">
											Percentage <span class="text-destructive">*</span>
										</Label>
										<div class="relative">
											<Input
												id="deposit-percent"
												type="number"
												inputmode="decimal"
												min="0.01"
												max="99.99"
												step="0.01"
												placeholder="25"
												bind:value={depositPercentDraft}
												disabled={!isEditable}
												class="pr-8"
											/>
											<span
												class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
												>%</span
											>
										</div>
										{#if depositPreviewAmount !== null}
											<p class="text-xs text-muted-foreground">
												≈ <span class="font-medium text-foreground"
													>${depositPreviewAmount.toFixed(2)}</span
												>
												of ${total.toFixed(2)} total
											</p>
										{:else if total === 0}
											<p class="text-xs text-muted-foreground">
												Add line items to see the deposit amount.
											</p>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Attachments -->
				<AttachmentList
					parentFk={{ quote_id: q.id }}
					purposeTag="quote_attachment"
					canUpload={member().can_upload_files}
					canDelete={member().can_upload_files}
				/>

				<!-- History timeline -->
				<QuoteHistoryTimeline quoteId={q.id} />
			</div>
		</div>

		{#if SendQuoteDialog}
			<SendQuoteDialog
				bind:open={sendOpen}
				quoteId={q.id}
				quoteNumberDisplay={q.quote_number_display}
				title={q.title}
				total={q.total}
				contactName={q.contact_name}
				contactEmail={q.contact_email}
				contactPhone={q.contact_phone}
				contactSmsOptOut={q.contact_sms_opt_out}
				mode={isDraft ? 'send' : 'resend'}
				onSent={() => {
					void refresh();
				}}
			/>
		{/if}

		{#if ApplyTemplateDialog}
			<ApplyTemplateDialog bind:open={templateOpen} onApply={onTemplateApply} />
		{/if}

		{#if OfflineDialog}
			<OfflineDialog
				bind:open={offlineOpen}
				mode={offlineMode}
				quote={{
					id: q.id,
					quote_number_display: q.quote_number_display,
					contact_name: q.contact_name
				}}
				onDone={() => {
					void refresh();
				}}
			/>
		{/if}

		{#if ConfirmDialog}
			<ConfirmDialog
				bind:open={confirmDeleteOpen}
				title="Delete {q.quote_number_display}?"
				description="This quote for {q.contact_name} will be removed. This cannot be undone."
				confirmLabel="Delete quote"
				variant="destructive"
				loading={deleting}
				onConfirm={remove}
			/>
		{/if}
	</PageWrapper>
{/if}
