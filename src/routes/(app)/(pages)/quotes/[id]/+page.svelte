<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import { Button } from '$lib/components/ui/button';
	import EditActionBar from '$lib/components/shared/EditActionBar.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import QuoteStatusBadge from '$lib/components/quotes/QuoteStatusBadge.svelte';
	import QuoteHistoryTimeline from '$lib/components/quotes/QuoteHistoryTimeline.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import QuotePackageBuilder from '$lib/components/quotes/QuotePackageBuilder.svelte';
	import QuoteProgressStrip from '$lib/components/quotes/QuoteProgressStrip.svelte';
	import ServiceAddressPicker from '$lib/components/quotes/ServiceAddressPicker.svelte';
	import DocumentDetailShell from '$lib/components/documents/DocumentDetailShell.svelte';
	import DocumentHeaderCard from '$lib/components/documents/DocumentHeaderCard.svelte';
	import DocumentSectionCard from '$lib/components/documents/DocumentSectionCard.svelte';
	import DocumentTotalsCard from '$lib/components/documents/DocumentTotalsCard.svelte';
	import DocumentDiscountEditor from '$lib/components/documents/DocumentDiscountEditor.svelte';
	import DocumentDepositEditor from '$lib/components/documents/DocumentDepositEditor.svelte';
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Calendar } from '$lib/components/ui/calendar';
	import { toast } from '$lib/stores/toast.svelte';
	import { quotesStore } from '$lib/stores/quotes.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { formatCurrency } from '$lib/utils/format';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type {
		QuoteDetail,
		QuoteLineDraft,
		QuoteLineItemRow,
		QuoteLinePhoto,
		QuotePackageDraft
	} from '$lib/types/quotes';
	import type { DocumentHeaderDate } from '$lib/types/documents';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const org = getOrgContext();
	const quote = $derived(quotesStore.getDetail(data.id));
	const detailStatus = $derived(quotesStore.getDetailStatus(data.id));
	const detailError = $derived(quotesStore.getDetailError(data.id));
	const showSkeleton = $derived(!quote && detailStatus !== 'error');

	// In-person drawn signature: resolve a short-lived signed URL when the accepted quote carries
	// one (null on online / offline-marked acceptances).
	let signatureUrl = $state<string | null>(null);
	$effect(() => {
		const id = quote?.acceptance_signature_media_id;
		if (!id) {
			signatureUrl = null;
			return;
		}
		let cancelled = false;
		void fetch(`/api/media/${id}/url?variant=web`)
			.then((r) => (r.ok ? r.json() : null))
			.then((b) => {
				if (!cancelled) signatureUrl = b?.data?.url ?? null;
			})
			.catch(() => {
				if (!cancelled) signatureUrl = null;
			});
		return () => {
			cancelled = true;
		};
	});

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
			taxable: li.taxable ?? true,
			unit_price: li.unit_price,
			unit_cost: li.unit_cost ?? null,
			source_catalog_item_id: li.source_catalog_item_id ?? null
		}));
	}

	// Simple-quote line list (the flat, single-option path — today's behavior). Ignored when
	// the quote is tiered (Good-Better-Best): then `packages` holds each tier's own lines.
	let lineItems = $state<QuoteLineDraft[]>([]);
	// Good-Better-Best tiers. Empty = simple quote. Each package owns its own `lines`.
	let packages = $state<QuotePackageDraft[]>([]);
	const isTiered = $derived(packages.length > 0);
	// The recommended tier drives the quote's headline totals (matches recalcQuoteTotals).
	const recommendedPkg = $derived(
		isTiered ? (packages.find((p) => p.is_recommended) ?? packages[0] ?? null) : null
	);
	// Flattened lines across all tiers, each stamped with its package_key — the authoritative
	// list sent on save and used for line-level validation. Equals `lineItems` when simple.
	const allLines = $derived<QuoteLineDraft[]>(
		isTiered
			? packages.flatMap((p) => p.lines.map((li) => ({ ...li, package_key: p.package_key })))
			: lineItems
	);
	// Per-line photos for this quote, grouped by line_key, loaded independently of the detail.
	let linePhotos = $state<Record<string, QuoteLinePhoto[]>>({});
	let titleDraft = $state('');
	let serviceAddressIdDraft = $state<string | null>(null);
	let taxRateDraft = $state('0');
	let notesDraft = $state('');
	let internalNotesDraft = $state('');
	let termsDraft = $state('');
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
		if (q.packages.length > 0) {
			// Tiered quote — group the flat lines under their package by package_id.
			packages = q.packages.map((p) => ({
				client_id: p.package_key,
				package_key: p.package_key,
				name: p.name,
				is_recommended: p.is_recommended,
				lines: toDrafts(q.line_items.filter((li) => li.package_id === p.id))
			}));
			lineItems = [];
		} else {
			packages = [];
			lineItems = toDrafts(q.line_items);
		}
		titleDraft = q.title;
		serviceAddressIdDraft = q.service_address_id ?? null;
		taxRateDraft = String(Number(q.tax_rate) * 100);
		notesDraft = q.notes ?? '';
		internalNotesDraft = q.internal_notes ?? '';
		termsDraft = q.terms ?? '';
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
	let shareLinkOpen = $state(false);
	let templateOpen = $state(false);
	let catalogOpen = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let converting = $state(false);
	// Edit-after-send: the contractor has re-opened an already-sent (sent/viewed) quote to edit
	// it. Draft/changes-requested quotes are edited without this toggle (they're always editable).
	let editMode = $state(false);
	// Set once any section save lands while in edit-after-send mode, so the follow-up
	// re-send is treated as a revision (freezes a new version snapshot). Reset on send/exit.
	let editedAfterSend = $state(false);
	// Section-block editing (Jobber pattern, same as our Jobs detail page): each card carries
	// ONE pencil that opens the WHOLE block for editing with a Save/Cancel scoped to that card.
	// Only one section is open at a time. `pricing` covers line items + tiers; `discount` and
	// `deposit` are each their OWN always-visible inline control (Jobber/HCP adjust the discount
	// and the required-deposit toggle without opening line-item editing); the other sections group
	// their own fields.
	let editingSection = $state<
		'details' | 'notes' | 'terms' | 'pricing' | 'discount' | 'deposit' | null
	>(null);
	// Save state for the text sections (Details / Notes / Terms). Pricing uses `saving` via save().
	let sectionSaving = $state(false);
	let sectionError = $state<string | null>(null);
	// Kept as a derived so all the totals-preview / line-item template refs below still read a
	// single `pricingEditing` flag.
	const pricingEditing = $derived(editingSection === 'pricing');
	const discountEditing = $derived(editingSection === 'discount');
	const depositEditing = $derived(editingSection === 'deposit');
	// Totals card previews the live draft while either the line-items OR the discount block is being
	// edited (both change the total); the deposit block does not affect the total.
	const moneyPreview = $derived(pricingEditing || discountEditing);

	const isAccepted = $derived(quote?.status === 'accepted');
	const isDraft = $derived(quote?.status === 'draft');
	const isExpired = $derived(quote?.status === 'expired');
	const isChangesRequested = $derived(quote?.status === 'changes_requested');
	// Intrinsically-editable states — a draft or change-requested quote is in edit mode by default.
	const alwaysEditable = $derived(isDraft || isChangesRequested);
	// Editing is unlocked when the quote is intrinsically editable (draft / changes-requested) OR
	// the contractor has re-opened a sent/viewed quote via "Edit". Gates whether pencils appear.
	const isEditable = $derived(alwaysEditable || editMode);
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
	// Edit-after-send is offered only while the quote is still out with the customer (sent/viewed)
	// and the member can edit. Accepted (signed/paid) / declined / expired quotes stay locked.
	const canEnterEditMode = $derived(
		(quote?.status === 'sent' || quote?.status === 'viewed') && canEditPerm
	);

	// A section can be edited when editing is unlocked (draft/changes-requested, or edit-after-send)
	// and the member can edit quotes. A NEW section can only be opened when none is already open.
	const canEditSection = $derived(isEditable && canEditPerm);
	const canStartSection = $derived(canEditSection && editingSection === null);

	// Open a section for block editing — re-seed every draft from the saved quote first so the
	// inputs reflect current values, then flip the section on.
	function startSection(name: 'details' | 'notes' | 'terms' | 'pricing' | 'discount' | 'deposit') {
		if (!canStartSection || !quote) return;
		initDrafts(quote);
		sectionError = null;
		editingSection = name;
	}
	// Cancel the open section — discard drafts by re-seeding from the saved quote.
	function cancelSection() {
		if (quote) initDrafts(quote);
		editingSection = null;
		sectionError = null;
	}

	// Generic PATCH + close for the text sections (Details / Notes / Terms). On success re-seeds
	// all drafts, closes the section, and (in edit-after-send) flags the follow-up re-send as a
	// revision. Inline `sectionError` keeps the card open on failure.
	async function commitSection(payload: Record<string, unknown>) {
		if (!quote) return;
		sectionSaving = true;
		sectionError = null;
		try {
			const res = await fetch(`/api/quotes/${quote.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				sectionError = body.error ?? 'Could not save.';
				return;
			}
			await refresh();
			if (editMode) editedAfterSend = true;
			editingSection = null;
			toast.success('Saved');
		} catch {
			sectionError = 'Network error. Try again.';
		} finally {
			sectionSaving = false;
		}
	}

	// Details block: title (required) + service address + valid-until + tax rate, saved together.
	function saveDetails() {
		if (!titleDraft.trim()) {
			sectionError = 'Title is required.';
			return;
		}
		const n = Number(taxRateDraft);
		if (!Number.isFinite(n) || n < 0 || n > 100) {
			sectionError = 'Enter a tax rate between 0 and 100.';
			return;
		}
		void commitSection({
			title: titleDraft.trim(),
			service_address_id: serviceAddressIdDraft,
			expires_at: expiresAtDraft ? `${expiresAtDraft}T23:59:59.000Z` : null,
			tax_rate: n / 100
		});
	}
	// Notes block: client-facing + internal notes together.
	function saveNotes() {
		void commitSection({
			notes: notesDraft.trim() || null,
			internal_notes: internalNotesDraft.trim() || null
		});
	}
	// Terms block.
	function saveTerms() {
		void commitSection({ terms: termsDraft.trim() || null });
	}
	// Discount block: its own always-visible inline control (decoupled from the line-items block —
	// Jobber/HCP adjust a quote-level discount without editing line items). Editable only when the
	// quote has at least one line item to discount. Validates locally, then PATCHes only the
	// discount fields via the shared section commit.
	function saveDiscount() {
		if (depositLocked) return;
		if (discountTypeDraft !== 'none') {
			if (!Number.isFinite(discountValueNum) || discountValueNum <= 0) {
				sectionError =
					discountTypeDraft === 'percent'
						? 'Enter a discount percentage greater than 0.'
						: 'Enter a discount amount greater than 0.';
				return;
			}
			if (discountTypeDraft === 'percent' && discountValueNum > 100) {
				sectionError = 'Discount percentage cannot exceed 100.';
				return;
			}
		}
		const payload: Record<string, unknown> = { discount_type: discountTypeDraft };
		if (discountTypeDraft === 'none') {
			payload.discount_value = null;
			payload.discount_label = null;
		} else {
			payload.discount_value = discountValueNum;
			payload.discount_label = discountLabelDraft.trim() || null;
		}
		void commitSection(payload);
	}
	// Deposit block: its own independent inline control (decoupled from the pricing/line-items
	// block — Jobber/HCP let you flip the required-deposit toggle without editing line items).
	// Validates the deposit locally (mirrors the server superRefine + the deposit-<-total rule),
	// then PATCHes ONLY the deposit fields via the shared section commit.
	function saveDeposit() {
		if (depositLocked) return;
		if (depositRequiredDraft) {
			if (depositTypeDraft === 'percent') {
				if (!Number.isFinite(depositPercentNum) || depositPercentNum <= 0 || depositPercentNum >= 100) {
					sectionError = 'Enter a percentage between 0.01 and 99.99.';
					return;
				}
			} else {
				if (!Number.isFinite(depositAmountNum) || depositAmountNum <= 0) {
					sectionError = 'Enter a deposit amount.';
					return;
				}
				if (total > 0 && depositAmountNum >= total) {
					sectionError = 'Deposit must be less than the quote total.';
					return;
				}
			}
		}
		const payload: Record<string, unknown> = {
			deposit_required: depositRequiredDraft,
			deposit_type: depositTypeDraft
		};
		if (depositTypeDraft === 'percent') {
			payload.deposit_percent = depositRequiredDraft ? depositPercentNum : null;
			payload.deposit_amount = null;
		} else {
			payload.deposit_amount = depositRequiredDraft ? depositAmountNum : null;
			payload.deposit_percent = null;
		}
		void commitSection(payload);
	}

	// ── Pricing section (line items + discount + deposit) ────────────────────────
	// Reuses the existing full-document save() (validates + PATCHes line items, packages,
	// discount, deposit, tax). save() re-seeds drafts on success → `dirty` clears; we detect
	// that to close the section (and flag a post-send edit for the re-send revision).
	async function savePricing() {
		await save();
		if (!dirty) {
			editingSection = null;
			if (editMode) editedAfterSend = true;
		}
	}

	// Exit edit-after-send. Re-send (revision) is a separate explicit action, matching
	// Jobber/HCP ("amend the quote, then re-send").
	function exitEditMode() {
		cancelSection();
		editMode = false;
		editedAfterSend = false;
	}

	// Base subtotal excludes optional add-ons (they only count if the customer selects them).
	// On a tiered quote the headline base is the RECOMMENDED tier's required lines (mirrors
	// recalcQuoteTotals); on a simple quote it's the full flat list.
	const subtotalSource = $derived(isTiered ? (recommendedPkg?.lines ?? []) : lineItems);
	const subtotal = $derived(
		subtotalSource.reduce((s, li) => {
			if (li.is_optional) return s;
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);
	// Optional add-ons (draft preview) for the totals card while editing — from the recommended
	// tier when tiered, else the flat list.
	const draftOptionalItems = $derived(
		subtotalSource
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
		pricingEditing
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
	// Per-line tax: only required TAXABLE lines feed the tax base. The quote-level discount is
	// allocated proportionally across the whole subtotal, so tax hits the taxable share of the
	// discounted amount (mirrors recalcQuoteTotals). Collapses to discounted × rate when every
	// line is taxable.
	const taxableSubtotal = $derived(
		subtotalSource.reduce((s, li) => {
			if (li.is_optional || li.taxable === false) return s;
			const q = Number(li.quantity);
			const p = Number(li.unit_price);
			if (!Number.isFinite(q) || !Number.isFinite(p)) return s;
			return s + Math.round(q * p * 100) / 100;
		}, 0)
	);
	const taxableAfterDiscount = $derived(
		subtotal > 0 ? (taxableSubtotal * discountedSubtotal) / subtotal : 0
	);
	const taxAmount = $derived(Math.round(taxableAfterDiscount * taxRateNum * 100) / 100);
	const total = $derived(
		Math.round((discountedSubtotal + taxableAfterDiscount * taxRateNum) * 100) / 100
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

	const dirty = $derived.by(() => {
		if (!quote) return false;
		if (titleDraft.trim() !== quote.title) return true;
		if ((serviceAddressIdDraft ?? null) !== (quote.service_address_id ?? null)) return true;
		if (notesDraft.trim() !== (quote.notes ?? '')) return true;
		if (internalNotesDraft.trim() !== (quote.internal_notes ?? '')) return true;
		if (termsDraft.trim() !== (quote.terms ?? '')) return true;
		const currentExpiry = quote.expires_at ? quote.expires_at.slice(0, 10) : '';
		if (expiresAtDraft !== currentExpiry) return true;
		const currentTaxPct = String(Number(quote.tax_rate) * 100);
		if (Number(taxRateDraft) !== Number(currentTaxPct)) return true;
		// Tiered-ness changed (simple ⇄ Good-Better-Best) is always a dirty edit.
		const wasTiered = quote.packages.length > 0;
		if (wasTiered !== isTiered) return true;

		if (isTiered) {
			if (packages.length !== quote.packages.length) return true;
			// Compare each tier in order: name, recommended flag, and its lines. Original lines
			// for a tier are the flat lines whose package_id matches that tier's db id.
			for (let i = 0; i < packages.length; i++) {
				const dp = packages[i];
				const op = quote.packages[i];
				if (dp.package_key !== op.package_key) return true;
				if (dp.name.trim() !== op.name) return true;
				if (dp.is_recommended !== op.is_recommended) return true;
				const origLines = quote.line_items.filter((li) => li.package_id === op.id);
				if (linesDiffer(dp.lines, origLines)) return true;
			}
			return false;
		}

		if (linesDiffer(lineItems, quote.line_items)) return true;
		return false;
	});

	// ── Header edit bar wiring ───────────────────────────────────────────────────
	// Friendly block name for the header bar, plus the shared save flag / dirty-guard both the
	// header bar and the in-card footer read, so they can never diverge. Pricing tracks `dirty`
	// (its in-card Save is dirty-gated); text sections always allow Save, like their footers.
	const SECTION_LABELS = {
		details: 'Details',
		notes: 'Notes',
		terms: 'Terms',
		pricing: 'Pricing',
		discount: 'Discount',
		deposit: 'Deposit'
	};
	const sectionBusy = $derived(pricingEditing ? saving : sectionSaving);
	const sectionCanSave = $derived(pricingEditing ? dirty : true);
	// Header Save dispatches to whichever block is open (only one is ever open at a time), running
	// the same validation as the in-card Save.
	function saveCurrentSection() {
		switch (editingSection) {
			case 'details':
				saveDetails();
				break;
			case 'notes':
				saveNotes();
				break;
			case 'terms':
				saveTerms();
				break;
			case 'pricing':
				void savePricing();
				break;
			case 'discount':
				saveDiscount();
				break;
			case 'deposit':
				saveDeposit();
				break;
		}
	}

	// Field-by-field comparison of a draft line list against the saved rows (order-sensitive).
	function linesDiffer(draft: QuoteLineDraft[], orig: QuoteLineItemRow[]): boolean {
		if (draft.length !== orig.length) return true;
		for (let i = 0; i < draft.length; i++) {
			const a = draft[i];
			const b = orig[i];
			if (a.description !== b.description) return true;
			if ((a.details?.trim() || '') !== (b.details ?? '')) return true;
			if (Number(a.quantity) !== Number(b.quantity)) return true;
			if ((a.unit?.trim() || '') !== (b.unit ?? '')) return true;
			if ((a.section_label?.trim() || '') !== (b.section_label ?? '')) return true;
			if ((a.is_optional ?? false) !== (b.is_optional ?? false)) return true;
			if ((a.taxable ?? true) !== (b.taxable ?? true)) return true;
			if (Number(a.unit_price) !== Number(b.unit_price)) return true;
		}
		return false;
	}

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

	// Convert a simple quote into Good-Better-Best tiers. Seeds the canonical three tiers and
	// moves the current lines into the recommended middle tier ("Better") — the contractor
	// then builds out the cheaper/premium tiers. Reversible before saving via toSingleOption().
	function toTiered() {
		if (isTiered || !pricingEditing) return;
		const existing = lineItems;
		packages = [
			{
				client_id: crypto.randomUUID(),
				package_key: crypto.randomUUID(),
				name: 'Good',
				is_recommended: false,
				lines: []
			},
			{
				client_id: crypto.randomUUID(),
				package_key: crypto.randomUUID(),
				name: 'Better',
				is_recommended: true,
				lines: existing
			},
			{
				client_id: crypto.randomUUID(),
				package_key: crypto.randomUUID(),
				name: 'Best',
				is_recommended: false,
				lines: []
			}
		];
		lineItems = [];
	}

	// Collapse tiers back into a single option — merges every tier's lines into one flat list.
	function toSingleOption() {
		if (!isTiered || !pricingEditing) return;
		lineItems = packages.flatMap((p) => p.lines);
		packages = [];
	}

	let SendQuoteDialog = $state<
		typeof import('$lib/components/documents/SendDocumentDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!sendOpen || SendQuoteDialog) return;
		void import('$lib/components/documents/SendDocumentDialog.svelte').then((m) => {
			SendQuoteDialog = m.default;
		});
	});

	let ShareQuoteLinkDialog = $state<
		typeof import('$lib/components/quotes/ShareQuoteLinkDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!shareLinkOpen || ShareQuoteLinkDialog) return;
		void import('$lib/components/quotes/ShareQuoteLinkDialog.svelte').then((m) => {
			ShareQuoteLinkDialog = m.default;
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
		if (!quote || !pricingEditing) return;
		for (const li of allLines) {
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
		// Tiered (Good-Better-Best) guardrails — mirror the server's validatePackages so the
		// contractor gets an inline toast instead of a 422.
		if (isTiered) {
			if (packages.length < 2 || packages.length > 3) {
				toast.error('A tiered quote needs 2 or 3 packages');
				return;
			}
			if (packages.some((p) => !p.name.trim())) {
				toast.error('Every package needs a name');
				return;
			}
			if (packages.filter((p) => p.is_recommended).length !== 1) {
				toast.error('Mark exactly one package as recommended');
				return;
			}
			if (packages.some((p) => p.lines.length === 0)) {
				toast.error('Every package needs at least one line item');
				return;
			}
		}
		saving = true;
		try {
			// Pricing-section save: only the line items + tiers. Discount and deposit each save
			// independently via their own inline cards; the atomic fields (title, notes, terms,
			// dates, address, tax) save via their own inline rows — none are resent here, which also
			// stops a cancelled/abandoned draft from another section leaking into a pricing save.
			const patchBody: Record<string, unknown> = {
				line_items: allLines.map((li, idx) => ({
					line_key: li.line_key,
					package_key: li.package_key ?? null,
					description: li.description.trim(),
					details: li.details?.trim() || null,
					quantity: Number(li.quantity),
					unit: li.unit?.trim() || null,
					section_label: li.section_label?.trim() || null,
					is_optional: li.is_optional ?? false,
					taxable: li.taxable ?? true,
					unit_price: Number(li.unit_price),
					unit_cost:
						li.unit_cost !== undefined && li.unit_cost !== null ? Number(li.unit_cost) : null,
					source_catalog_item_id: li.source_catalog_item_id ?? null,
					position: idx
				})),
				// Good-Better-Best: send the tiers (2–3) when tiered, or [] to (re)assert a simple
				// quote. Sent on every save so the server keeps packages in sync with the lines.
				packages: packages.map((p, idx) => ({
					package_key: p.package_key,
					name: p.name.trim(),
					is_recommended: p.is_recommended,
					position: idx
				}))
			};
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

	// In-person "sign on this device" — hand the device to the customer to approve + draw their
	// signature on the spot. Lazy-loaded like the other dialogs.
	let signInPersonOpen = $state(false);
	let SignInPersonDialog = $state<
		typeof import('$lib/components/quotes/QuoteInPersonSignDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!signInPersonOpen || SignInPersonDialog) return;
		void import('$lib/components/quotes/QuoteInPersonSignDialog.svelte').then((m) => {
			SignInPersonDialog = m.default;
		});
	});

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

	// One-line formatted address for the Details inline row's read-only display.
	function quoteAddressLine(a: NonNullable<QuoteDetail['service_address']>): string {
		return [a.address_line_1, a.address_line_2, [a.city, a.state, a.zip].filter(Boolean).join(' ')]
			.filter(Boolean)
			.join(', ');
	}

	// Key-dates row for the shared document header.
	const headerDates = $derived.by<DocumentHeaderDate[]>(() => {
		const q = quote;
		if (!q) return [];
		const out: DocumentHeaderDate[] = [{ label: 'Issued', value: fmtDate(q.created_at) }];
		if (q.expires_at) {
			out.push({
				label: 'Expires',
				value: fmtDate(q.expires_at),
				tone: isExpired ? 'danger' : 'default'
			});
		}
		if (q.sent_at) out.push({ label: 'Sent', value: fmtDate(q.sent_at) });
		if (q.accepted_at)
			out.push({ label: 'Accepted', value: fmtDate(q.accepted_at), tone: 'success' });
		if (q.acceptance_signature_name) {
			out.push({
				label: q.acceptance_signature_media_id ? 'Signed in person' : 'Signed by',
				value: q.acceptance_signature_name,
				tone: 'signed',
				icon: 'ri-quill-pen-line'
			});
		}
		if (q.declined_at)
			out.push({ label: 'Declined', value: fmtDate(q.declined_at), tone: 'danger' });
		return out;
	});
</script>

<svelte:head><title>{quote ? quote.quote_number_display : 'Quote'}</title></svelte:head>

<!-- Shared Cancel + Save row for the text sections (Details / Notes / Terms). -->
{#snippet sectionFooter(onSave: () => void)}
	<EditActionBar {onSave} onCancel={cancelSection} saving={sectionSaving} error={sectionError} size="sm" />
{/snippet}

{#if showSkeleton}
	<PageWrapper title="Quote" back="/quotes">
		<DocumentDetailShell>
			{#snippet main()}
				<div class="card" style="padding: 16px;"><SkeletonLoader lines={3} /></div>
				<div class="card" style="padding: 16px;"><SkeletonLoader lines={4} /></div>
				<div class="card" style="padding: 16px;"><SkeletonLoader lines={5} /></div>
			{/snippet}
			{#snippet sidebar()}
				<div class="card" style="padding: 16px;"><SkeletonLoader lines={4} /></div>
			{/snippet}
		</DocumentDetailShell>
	</PageWrapper>
{:else if !quote}
	<PageWrapper title="Quote" back="/quotes">
		<p class="quote-detail__error">{detailError ?? 'Not found'}</p>
	</PageWrapper>
{:else}
	{@const q = quote}
	<PageWrapper title={q.quote_number_display} back="/quotes">
		{#snippet actions()}
			{#if editingSection !== null}
				<!-- A block is being edited — mirror its Save/Cancel up here so it's reachable
				     no matter how far the card is scrolled. Same handlers as the in-card footer. -->
				<EditActionBar
					onSave={saveCurrentSection}
					onCancel={cancelSection}
					saving={sectionBusy}
					canSave={sectionCanSave}
					error={sectionError}
					label={`Editing ${SECTION_LABELS[editingSection]}`}
				/>
			{:else if alwaysEditable}
				<!-- Draft / changes-requested: fields edit inline; the header only sends. -->
				{#if canSendPerm}
					<button
						type="button"
						class="btn btn--outline"
						onclick={() => (sendOpen = true)}
						disabled={allLines.length === 0}
					>
						<i class="ri-send-plane-line" aria-hidden="true"></i>
						{isDraft ? 'Send' : 'Resend'}
					</button>
				{/if}
			{:else if editMode}
				<!-- Edit-after-send unlocked: edits auto-save inline; re-send when done. -->
				{#if canResend && canSendPerm}
					<Button type="button" onclick={() => (sendOpen = true)}>
						<i class="ri-send-plane-line" aria-hidden="true"></i>Re-send
					</Button>
				{/if}
				<Button type="button" variant="outline" onclick={exitEditMode}>Done</Button>
			{:else}
				<!-- Sent/viewed and locked: re-open for edits, or re-deliver as-is. -->
				{#if canEnterEditMode}
					<Button type="button" variant="outline" onclick={() => (editMode = true)}>
						<i class="ri-pencil-line" aria-hidden="true"></i>Edit
					</Button>
				{/if}
				{#if canResend && canSendPerm}
					<Button type="button" variant="outline" onclick={() => (sendOpen = true)}>
						<i class="ri-send-plane-line" aria-hidden="true"></i>Resend
					</Button>
				{/if}
			{/if}
			{#if editingSection === null && isMarkable && canEditPerm}
				<Button type="button" onclick={() => (signInPersonOpen = true)}>
					<i class="ri-quill-pen-line" aria-hidden="true"></i>Sign in person
				</Button>
			{/if}
			{#if editingSection === null && isAccepted && canConvertPerm}
				<Button
					loadingLabel="Creating…"
					successLabel="Created"
					loading={converting}
					onclick={convertToInvoice}
				>
					Create invoice
					{#snippet icon()}<i class="ri-receipt-line" aria-hidden="true"></i>{/snippet}
				</Button>
			{/if}
			{#if editingSection === null}
				{@const showMark = isMarkable && canEditPerm}
				{@const showDelete = isDeletable && canDeletePerm}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="btn btn--icon btn--outline" aria-label="More actions">
						<i class="ri-more-2-fill" aria-hidden="true"></i>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={previewAsClient}>
							<i class="ri-eye-line" aria-hidden="true"></i> Preview as client
						</DropdownMenu.Item>
						{#if canSendPerm && q.status !== 'declined' && q.status !== 'expired'}
							<DropdownMenu.Item onclick={() => (shareLinkOpen = true)}>
								<i class="ri-links-line" aria-hidden="true"></i> Copy client link
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Item
							closeOnSelect={false}
							onclick={downloadPdf}
							disabled={downloadingPdf}
						>
							{#if downloadingPdf}
								<i
									class="ri-loader-4-line"
									aria-hidden="true"
									style="animation: spin 1s linear infinite;"
								></i> Preparing PDF…
							{:else}
								<i class="ri-download-line" aria-hidden="true"></i> Download PDF
							{/if}
						</DropdownMenu.Item>
						{#if showMark}
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={() => openOffline('accepted')}>
								<i class="ri-checkbox-circle-line" aria-hidden="true"></i> Mark as approved
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => openOffline('declined')}>
								<i class="ri-close-circle-line" aria-hidden="true"></i> Mark as declined
							</DropdownMenu.Item>
						{/if}
						{#if canConvertToJobPerm && q.status !== 'declined' && q.status !== 'expired'}
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={() => goto(`/jobs/new?from_quote=${q.id}`)}>
								<i class="ri-briefcase-line" aria-hidden="true"></i> Convert to job
							</DropdownMenu.Item>
						{/if}
						{#if canCreatePerm}
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={duplicate} disabled={duplicating}>
								<i class="ri-file-copy-line" aria-hidden="true"></i> Duplicate
							</DropdownMenu.Item>
						{/if}
						{#if showDelete}
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								class="dropdown__item--danger"
								onclick={() => (confirmDeleteOpen = true)}
							>
								<i class="ri-delete-bin-line" aria-hidden="true"></i> Delete quote
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		{/snippet}

		<DocumentDetailShell>
			{#snippet main()}
				<!-- Progress strip -->
				{#if isEditable}
					<div class="card quote-detail__progress-wrap">
						<QuoteProgressStrip current="build" />
					</div>
				{/if}

				<!-- Alert: changes requested -->
				{#if q.active_change_request}
					<div class="quote-alert quote-alert--warning">
						<div class="quote-alert__icon-wrap">
							<i class="ri-message-2-line" aria-hidden="true"></i>
						</div>
						<div class="quote-alert__body">
							<div class="quote-alert__head">
								<p class="quote-alert__title">Client requested changes</p>
								<span class="quote-alert__time">
									{formatRequestedAt(q.active_change_request.requested_at)}
								</span>
							</div>
							<p class="quote-alert__message">{q.active_change_request.message}</p>
							<p class="quote-alert__hint">
								Update the quote below and re-send. The request will be marked resolved
								automatically.
							</p>
						</div>
					</div>
				{/if}

				<!-- Alert: expired -->
				{#if isExpired}
					<div class="quote-alert quote-alert--muted">
						<div class="quote-alert__icon-wrap">
							<i class="ri-time-line" aria-hidden="true"></i>
						</div>
						<div class="quote-alert__body">
							<p class="quote-alert__title">This quote has expired</p>
							<p class="quote-alert__message">
								{#if q.expires_at}Validity passed {fmtDate(q.expires_at)}.{/if}
								The deal stays in your pipeline — revive it below.
							</p>
							<div class="quote-alert__actions">
								<span class="quote-alert__hint" style="margin:0;">Extend</span>
								<button
									type="button"
									class="btn btn--sm btn--outline"
									disabled={extending}
									onclick={() => extendQuote(7)}>+7 days</button
								>
								<button
									type="button"
									class="btn btn--sm btn--primary"
									disabled={extending}
									onclick={() => extendQuote(14)}
								>
									{#if extending}<i
											class="ri-loader-4-line"
											style="animation:spin 1s linear infinite;"
											aria-hidden="true"
										></i>{/if}
									+14 days
								</button>
								<button
									type="button"
									class="btn btn--sm btn--outline"
									disabled={extending}
									onclick={() => extendQuote(30)}>+30 days</button
								>
								<a href="tel:{q.contact_phone}" class="btn btn--sm btn--outline">
									<i class="ri-phone-line" aria-hidden="true"></i>Call
								</a>
							</div>
						</div>
					</div>
				{/if}

				<!-- Document header card -->
				<DocumentHeaderCard
					name={q.contact_name}
					meta={`${q.contact_phone}${q.contact_email ? ` · ${q.contact_email}` : ''}`}
					noEmail={!q.contact_email}
					dates={headerDates}
				>
					{#snippet badge()}
						<QuoteStatusBadge status={q.status} version={q.current_version} />
					{/snippet}
					{#snippet chips()}
						{#if q.viewed_at}
							<span class="quote-doc-views">
								<i class="ri-eye-line" aria-hidden="true"></i>
								{q.view_count} view{q.view_count === 1 ? '' : 's'}
							</span>
						{/if}
					{/snippet}
					{#snippet subline()}
						{#if q.service_address}
							<p class="quote-doc-address">
								<i class="ri-map-pin-line" aria-hidden="true"></i>
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
					{/snippet}
					{#snippet footer()}
						{#if q.acceptance_signature_media_id && signatureUrl}
							<div class="quote-doc-signature">
								<img class="quote-doc-signature-img" src={signatureUrl} alt="Customer signature" />
							</div>
						{/if}
					{/snippet}
				</DocumentHeaderCard>

				<!-- Details card (section-block edit) -->
				<DocumentSectionCard title="Details">
					{#snippet actions()}
						{#if canStartSection}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => startSection('details')}
							>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span class="quote-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if editingSection === 'details'}
						<div class="doc-form">
							<div class="field">
								<label class="field__label" for="q-title">Title</label>
								<!-- svelte-ignore a11y_autofocus -->
								<Input id="q-title" class="field__input" bind:value={titleDraft} autofocus />
							</div>
							<div class="field">
								<span class="field__label">Service address</span>
								<ServiceAddressPicker
									contactId={q.contact_id}
									bind:selectedAddressId={serviceAddressIdDraft}
								/>
							</div>
							<div class="field">
								<span class="field__label">Valid until</span>
								<Calendar
									bind:value={expiresAtDraft}
									placeholder="Pick expiry date"
									min={new Date().toISOString().slice(0, 10)}
								/>
							</div>
							<div class="field">
								<label class="field__label" for="q-tax">Tax rate (%)</label>
								<Input
									id="q-tax"
									type="number"
									inputmode="decimal"
									min="0"
									max="100"
									step="0.01"
									class="field__input"
									bind:value={taxRateDraft}
								/>
							</div>
							{@render sectionFooter(saveDetails)}
						</div>
					{:else}
						<dl class="doc-facts">
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Title</dt>
								<dd class="doc-facts__value">{q.title}</dd>
							</div>
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Service address</dt>
								<dd class="doc-facts__value">
									{#if q.service_address}
										{quoteAddressLine(q.service_address)}
									{:else}
										<span class="doc-inline-muted">No service address</span>
									{/if}
								</dd>
							</div>
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Valid until</dt>
								<dd class="doc-facts__value">
									{#if q.expires_at}
										{fmtDate(q.expires_at)}
									{:else}
										<span class="doc-inline-muted">No expiry set</span>
									{/if}
								</dd>
							</div>
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Tax rate</dt>
								<dd class="doc-facts__value">{+(Number(q.tax_rate) * 100).toFixed(4)}%</dd>
							</div>
						</dl>
					{/if}
				</DocumentSectionCard>

				<!-- Notes card (section-block edit) -->
				<DocumentSectionCard title="Notes">
					{#snippet actions()}
						{#if canStartSection}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => startSection('notes')}
							>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span class="quote-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if editingSection === 'notes'}
						<div class="doc-form">
							<div class="field">
								<label class="field__label" for="q-notes">Client notes</label>
								<Textarea
									id="q-notes"
									class="field__input"
									bind:value={notesDraft}
									rows={3}
									placeholder="e.g. All work includes a 1-year warranty."
								/>
							</div>
							<div class="field">
								<label class="field__label" for="q-internal-notes">Internal notes</label>
								<Textarea
									id="q-internal-notes"
									class="field__input"
									bind:value={internalNotesDraft}
									rows={3}
									placeholder="e.g. Client mentioned tight budget."
								/>
							</div>
							{@render sectionFooter(saveNotes)}
						</div>
					{:else}
						<dl class="doc-facts">
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Client notes</dt>
								<dd class="doc-facts__value">
									{#if q.notes}
										<span class="doc-inline-pre">{q.notes}</span>
									{:else}
										<span class="doc-inline-muted">Visible to the customer - none yet</span>
									{/if}
								</dd>
							</div>
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Internal notes</dt>
								<dd class="doc-facts__value">
									{#if q.internal_notes}
										<span class="doc-inline-pre">{q.internal_notes}</span>
									{:else}
										<span class="doc-inline-muted">Staff only - none yet</span>
									{/if}
								</dd>
							</div>
						</dl>
					{/if}
				</DocumentSectionCard>

				<!-- Terms & Conditions card (section-block edit) -->
				<DocumentSectionCard title="Terms & Conditions">
					{#snippet actions()}
						{#if canStartSection}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => startSection('terms')}
							>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span class="quote-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if editingSection === 'terms'}
						<div class="doc-form">
							<div class="field">
								<Textarea
									class="field__input"
									bind:value={termsDraft}
									rows={6}
									placeholder="e.g. A 50% deposit is required to schedule. Balance due on completion."
								/>
							</div>
							{@render sectionFooter(saveTerms)}
						</div>
					{:else if q.terms}
						<span class="doc-inline-pre">{q.terms}</span>
					{:else}
						<span class="doc-inline-muted">
							Shown above the signature and on the PDF - none yet
						</span>
					{/if}
				</DocumentSectionCard>

				<!-- Line items card -->
				<DocumentSectionCard
					flush
					title={isTiered ? 'Packages' : 'Line items'}
					count={allLines.length}
				>
					{#snippet actions()}
						{#if pricingEditing}
							{#if isTiered}
								<button
									type="button"
									class="btn btn--sm btn--ghost"
									onclick={toSingleOption}
									title="Merge all packages back into a single option"
								>
									<i class="ri-list-unordered" aria-hidden="true"></i>
									<span class="quote-detail__btn-label">Single option</span>
								</button>
							{:else}
								<button
									type="button"
									class="btn btn--sm btn--outline"
									onclick={() => (catalogOpen = true)}
								>
									<i class="ri-book-open-line" aria-hidden="true"></i>
									<span class="quote-detail__btn-label">Price book</span>
								</button>
								<button
									type="button"
									class="btn btn--sm btn--outline"
									onclick={() => (templateOpen = true)}
								>
									<i class="ri-file-text-line" aria-hidden="true"></i>
									<span class="quote-detail__btn-label">Apply template</span>
								</button>
								<button
									type="button"
									class="btn btn--sm btn--outline"
									onclick={toTiered}
									title="Offer the customer 2–3 packages to choose from (Good-Better-Best)"
								>
									<i class="ri-stack-line" aria-hidden="true"></i>
									<span class="quote-detail__btn-label">Add packages</span>
								</button>
							{/if}
						{:else if canStartSection}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => startSection('pricing')}
							>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span class="quote-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#snippet subhead()}
						{#if isTiered}
							<p class="quote-detail__packages-hint">
								The customer picks <strong>one</strong> package. The
								<i class="ri-star-fill" aria-hidden="true"></i> recommended tier is highlighted and drives
								the quote's headline total.
							</p>
						{/if}
					{/snippet}
					{#if isTiered}
						<QuotePackageBuilder
							bind:packages
							readonly={!pricingEditing}
							quoteId={q.id}
							photosByLineKey={linePhotos}
							canEditPhotos={member().can_upload_files}
							showCost={member().can_view_revenue}
							targetMarginPct={org().target_margin_pct}
							enableTax
						/>
					{:else}
						<LineItemEditor
							bind:lineItems
							readonly={!pricingEditing}
							enableCatalog
							enableOptional
							enableTax
							externalCatalogTrigger
							bind:catalogOpen
							enablePhotos
							quoteId={q.id}
							photosByLineKey={linePhotos}
							canEditPhotos={member().can_upload_files}
							showCost={member().can_view_revenue}
							targetMarginPct={org().target_margin_pct}
						/>
					{/if}
					{#if pricingEditing}
						<EditActionBar
							onSave={() => void savePricing()}
							onCancel={cancelSection}
							{saving}
							canSave={dirty}
							size="sm"
							variant="card"
						/>
					{/if}
				</DocumentSectionCard>
			{/snippet}

			{#snippet sidebar()}
				<!-- Totals -->
				<DocumentTotalsCard
					subtotal={moneyPreview
						? subtotal.toFixed(2)
						: isAcceptedWithTotals
							? (q.accepted_subtotal ?? q.subtotal)
							: q.subtotal}
					discount_type={discountEditing ? discountTypeDraft : q.discount_type}
					discount_value={discountEditing ? discountValueDraft : q.discount_value}
					discount_amount={moneyPreview
						? discountAmount.toFixed(2)
						: isAcceptedWithTotals
							? acceptedDiscount.toFixed(2)
							: q.discount_amount}
					discount_label={discountEditing ? discountLabelDraft : q.discount_label}
					tax_rate={moneyPreview ? taxRateNum.toFixed(4) : q.tax_rate}
					tax_amount={moneyPreview
						? taxAmount.toFixed(2)
						: isAcceptedWithTotals
							? (q.accepted_tax_amount ?? q.tax_amount)
							: q.tax_amount}
					total={moneyPreview
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

				<!-- Discount section — its OWN always-visible inline control, independent of the
				     line-items block. Editable only when the quote has at least one line item. -->
				<DocumentSectionCard title="Discount">
					{#snippet actions()}
						{#if !discountEditing && canStartSection && allLines.length > 0 && !depositLocked}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => startSection('discount')}
							>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span class="quote-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if discountEditing}
						<DocumentDiscountEditor
							bare
							bind:type={discountTypeDraft}
							bind:value={discountValueDraft}
							bind:label={discountLabelDraft}
							{subtotal}
						/>
						{@render sectionFooter(saveDiscount)}
					{:else if q.discount_type !== 'none' && Number(q.discount_amount) > 0}
						<span class="doc-inline-pre">
							{#if q.discount_type === 'percent' && q.discount_value}
								{Number(q.discount_value).toFixed(0)}% off — −{formatCurrency(
									Number(q.discount_amount)
								)}
							{:else}
								{formatCurrency(Number(q.discount_amount))} off
							{/if}
							{#if q.discount_label}
								· {q.discount_label}
							{/if}
						</span>
					{:else if allLines.length === 0}
						<span class="doc-inline-muted">Add a line item first to apply a discount.</span>
					{:else}
						<span class="doc-inline-muted">No discount applied.</span>
					{/if}
				</DocumentSectionCard>

				<!-- Accepted add-on selections -->
				{#if isAcceptedWithTotals && quoteOptionalItems.length > 0}
					<div class="quote-optional-addons">
						<p class="quote-optional-addons__heading">Optional add-ons</p>
						<ul class="quote-optional-addons__list">
							{#each quoteOptionalItems as item, i (i)}
								<li class="quote-optional-addons__item">
									<span
										class="quote-optional-addons__desc{item.selected
											? ''
											: ' quote-optional-addons__desc--deselected'}"
									>
										{#if item.selected}
											<i class="ri-check-line" aria-hidden="true"></i>
										{:else}
											<span style="width:14px;display:inline-block;"></span>
										{/if}
										<span>{item.description || 'Untitled'}</span>
									</span>
									<span
										class="quote-optional-addons__amount{item.selected
											? ''
											: ' quote-optional-addons__amount--deselected'}"
									>
										{formatCurrency(item.total)}
									</span>
								</li>
							{/each}
						</ul>
						<p class="quote-optional-addons__hint">
							The customer's selections are included in the accepted total above.
						</p>
					</div>
				{/if}

				<!-- Deposit section — its OWN inline control, independent of the line-items block
				     (Jobber/HCP let you flip the required-deposit toggle without editing line items). -->
				{#if q.deposit_paid_amount > 0 && q.deposit_amount}
					<div class="quote-deposit-card quote-deposit-card--received">
						<div class="quote-deposit-card__icon-wrap">
							<i class="ri-check-line" aria-hidden="true"></i>
						</div>
						<div class="quote-deposit-card__body">
							<p class="quote-deposit-card__title">Deposit received</p>
							<p class="quote-deposit-card__desc">
								{formatCurrency(q.deposit_amount)}
								{#if q.deposit_paid_at}
									· paid {new Date(q.deposit_paid_at).toLocaleDateString('en-US')}
								{/if}
							</p>
						</div>
					</div>
				{:else if !depositLocked}
					<DocumentSectionCard title="Deposit">
						{#snippet actions()}
							{#if !depositEditing && canStartSection}
								<button
									type="button"
									class="btn btn--sm btn--outline"
									onclick={() => startSection('deposit')}
								>
									<i class="ri-pencil-line" aria-hidden="true"></i>
									<span class="quote-detail__btn-label">Edit</span>
								</button>
							{/if}
						{/snippet}
						{#if depositEditing}
							<DocumentDepositEditor
								bare
								bind:required={depositRequiredDraft}
								bind:type={depositTypeDraft}
								bind:amount={depositAmountDraft}
								bind:percent={depositPercentDraft}
								{total}
							/>
							{@render sectionFooter(saveDeposit)}
						{:else if q.deposit_required && q.deposit_amount}
							<span class="doc-inline-pre">
								{#if q.deposit_type === 'percent' && q.deposit_percent}
									{Number(q.deposit_percent).toFixed(0)}% deposit — {formatCurrency(
										q.deposit_amount
									)} due before work starts.
								{:else}
									{formatCurrency(q.deposit_amount)} deposit due before work starts.
								{/if}
							</span>
						{:else}
							<span class="doc-inline-muted">
								No deposit requested — client pays the full total after accepting.
							</span>
						{/if}
					</DocumentSectionCard>
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
			{/snippet}
		</DocumentDetailShell>

		{#if SendQuoteDialog}
			<SendQuoteDialog
				bind:open={sendOpen}
				kind="quote"
				documentId={q.id}
				numberDisplay={q.quote_number_display}
				subtitle={`${q.title} · ${formatCurrency(q.total)}`}
				amountForTokens={formatCurrency(q.total)}
				contactName={q.contact_name}
				contactEmail={q.contact_email}
				contactPhone={q.contact_phone}
				contactSmsOptOut={q.contact_sms_opt_out}
				mode={isDraft ? 'send' : 'resend'}
				revision={editedAfterSend}
				onSent={() => {
					editMode = false;
					editedAfterSend = false;
					void refresh();
				}}
			/>
		{/if}

		{#if ShareQuoteLinkDialog}
			<ShareQuoteLinkDialog
				bind:open={shareLinkOpen}
				quoteId={q.id}
				status={q.status}
				onActivated={() => {
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

		{#if SignInPersonDialog}
			<SignInPersonDialog
				bind:open={signInPersonOpen}
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

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.quote-detail {
		&__progress-wrap {
			padding: $space-3 $space-4;
		}

		// Tiered (Good-Better-Best) hint rendered in the line-items card subhead snippet.
		&__packages-hint {
			margin: 0;
			padding: 0 $space-4 $space-3;
			font-size: $fs-body;
			line-height: $lh-body;
			color: var(--color-text-secondary);

			i {
				color: var(--color-brand);
			}
		}

		&__btn-label {
			@media (max-width: #{$bp-tablet - 1px}) {
				display: none;
			}
		}

		&__error {
			font-size: $fs-body;
			color: var(--danger-solid);
		}
	}

	// Quote-only chips/blocks injected into the shared DocumentHeaderCard via snippets.
	.quote-doc-views {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: $fs-caption;
		color: var(--color-text-muted);

		i {
			font-size: 1.4rem;
		}
	}

	.quote-doc-address {
		display: flex;
		align-items: flex-start;
		gap: $space-1;
		margin-top: $space-1;
		font-size: $fs-body;
		color: var(--color-text-secondary);

		i {
			font-size: 1.4rem;
			flex-shrink: 0;
			margin-top: 2px;
		}
	}

	.quote-doc-signature {
		margin-top: $space-1;
	}

	.quote-doc-signature-img {
		max-width: 260px;
		max-height: 90px;
		padding: $space-2;
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
		background: #fff;
		object-fit: contain;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: $space-1;

		&__label {
			font-size: $fs-body;
			font-weight: $weight-medium;
			color: var(--color-text-secondary);
		}

		&__error {
			font-size: $fs-caption;
			color: var(--danger-solid);
		}
	}
</style>
