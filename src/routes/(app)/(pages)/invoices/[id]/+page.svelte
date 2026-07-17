<script lang="ts">
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import { Button } from '$lib/components/ui/button';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EditActionBar from '$lib/components/shared/EditActionBar.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import QuoteProgressStrip from '$lib/components/quotes/QuoteProgressStrip.svelte';
	import DocumentDetailShell from '$lib/components/documents/DocumentDetailShell.svelte';
	import DocumentHeaderCard from '$lib/components/documents/DocumentHeaderCard.svelte';
	import DocumentSectionCard from '$lib/components/documents/DocumentSectionCard.svelte';
	import DocumentTotalsCard from '$lib/components/documents/DocumentTotalsCard.svelte';
	import DocumentDiscountEditor from '$lib/components/documents/DocumentDiscountEditor.svelte';
	import InvoiceStatusBadge from '$lib/components/invoices/InvoiceStatusBadge.svelte';
	import PaymentHistory from '$lib/components/invoices/PaymentHistory.svelte';
	import AttachmentList from '$lib/components/media/AttachmentList.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/stores/toast.svelte';
	import { invoicesStore } from '$lib/stores/invoices.svelte';
	import { isEffectivelyOverdue } from '$lib/utils/invoices';
	import { Calendar } from '$lib/components/ui/calendar';
	import { getMemberContext } from '$lib/context/member';
	import { getOrgContext } from '$lib/context/org';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import type { PageData } from './$types';
	import type { InvoiceDetail, InvoiceLineItemRow } from '$lib/types/invoices';
	import type { QuoteLineDraft } from '$lib/types/quotes';
	import type { DocumentHeaderDate } from '$lib/types/documents';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const org = getOrgContext();
	const invoice = $derived(invoicesStore.getDetail(data.id));
	const detailStatus = $derived(invoicesStore.getDetailStatus(data.id));
	const detailError = $derived(invoicesStore.getDetailError(data.id));
	const showSkeleton = $derived(!invoice && detailStatus !== 'error');

	function toDrafts(rows: InvoiceLineItemRow[]): QuoteLineDraft[] {
		// Late-fee lines are real line items but surface only as a totals row, never in the editor.
		return rows
			.filter((li) => !li.is_late_fee)
			.map((li) => ({
				client_id: li.id,
				description: li.description,
				quantity: li.quantity,
				unit: li.unit ?? '',
				unit_price: li.unit_price,
				taxable: li.taxable ?? true,
				unit_cost: li.unit_cost ?? null,
				source_catalog_item_id: li.source_catalog_item_id ?? null
			}));
	}

	let lineItems = $state<QuoteLineDraft[]>([]);
	let titleDraft = $state('');
	let taxRateDraft = $state('0');
	let dueDateDraft = $state('');
	let notesDraft = $state('');
	let termsDraft = $state('');
	let discountTypeDraft = $state<'none' | 'fixed' | 'percent'>('none');
	let discountValueDraft = $state('');
	let discountLabelDraft = $state('');
	// Per-invoice automatic-reminders switch. Independently persisted via /reminders (not part
	// of the draft Save flow), so it's editable even after the invoice is sent.
	let sendReminders = $state(true);
	let remindersSaving = $state(false);
	// Org-level reminder schedule, shown read-only under the toggle.
	let reminderSummary = $state('');
	let reminderOrgEnabled = $state(false);
	// Per-invoice accept-tips switch. Independently persisted via /tips (not part of the draft
	// Save flow), so it's editable at any status. Org tips_enabled stays the master gate.
	let acceptTips = $state(true);
	let tipsSaving = $state(false);
	// Per-invoice late-fee terms (M8 Phase 2). Snapshot from the org default at create, editable
	// here at any status until a fee is applied. Persisted via /late-fee-config (its own Save, not
	// the draft flow) so it works after the invoice is sent.
	let lateFeeEnabledDraft = $state(true);
	let lateFeeTypeDraft = $state<'flat' | 'percent'>('percent');
	// string on seed / when empty, number once the type="number" Input coerces bind:value.
	let lateFeeValueDraft = $state<string | number>('');
	let lateFeeConfigSaving = $state(false);
	let initializedForId = $state<string | null>(null);

	function initDrafts(i: InvoiceDetail) {
		lineItems = toDrafts(i.line_items);
		titleDraft = i.title;
		taxRateDraft = String(Number(i.tax_rate) * 100);
		dueDateDraft = i.due_date ?? '';
		notesDraft = i.notes ?? '';
		termsDraft = i.terms ?? '';
		discountTypeDraft = (i.discount_type as 'none' | 'fixed' | 'percent') ?? 'none';
		discountValueDraft = i.discount_value ?? '';
		discountLabelDraft = i.discount_label ?? '';
		sendReminders = i.send_payment_reminders;
		acceptTips = i.accept_tips;
		lateFeeEnabledDraft = i.late_fee_enabled;
		lateFeeTypeDraft = i.late_fee_type === 'flat' ? 'flat' : 'percent';
		lateFeeValueDraft = i.late_fee_value ?? '';
		initializedForId = i.id;
	}

	$effect(() => {
		void invoicesStore.loadDetail(data.id);
	});

	// Load the org's live reminder schedule once for the summary line.
	$effect(() => {
		void fetch('/api/invoices/reminder-schedule')
			.then((r) => (r.ok ? r.json() : null))
			.then((b) => {
				if (b?.data) {
					reminderSummary = b.data.summary ?? '';
					reminderOrgEnabled = Boolean(b.data.enabled);
				}
			})
			.catch(() => {});
	});

	// Persist the per-invoice reminders switch immediately. Optimistic — reverts on failure.
	// A DRAFT just stores the flag (used later at send); a sent invoice re-enrolls/stops its
	// dunning sequence server-side via the invoice.reminders_toggled event.
	async function toggleReminders(next: boolean) {
		if (!invoice || remindersSaving) return;
		const prev = !next;
		remindersSaving = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/reminders`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabled: next })
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Could not update reminders');
				sendReminders = prev;
				return;
			}
			toast.success(next ? 'Reminders on for this invoice' : 'Reminders off for this invoice');
		} catch {
			toast.error('Network error');
			sendReminders = prev;
		} finally {
			remindersSaving = false;
		}
	}

	// Persist the per-invoice accept-tips switch immediately. Optimistic — reverts on failure.
	// Works at any status; the org tips_enabled toggle is the master gate above this.
	async function toggleTips(next: boolean) {
		if (!invoice || tipsSaving) return;
		const prev = !next;
		tipsSaving = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/tips`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabled: next })
			});
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				toast.error(b.error ?? 'Could not update tips');
				acceptTips = prev;
				return;
			}
			toast.success(next ? 'Tips on for this invoice' : 'Tips off for this invoice');
		} catch {
			toast.error('Network error');
			acceptTips = prev;
		} finally {
			tipsSaving = false;
		}
	}

	// Persist the per-invoice late-fee TERMS (enabled/type/value). Independent of the draft Save
	// flow so it works at any status before a fee lands. Refreshes so the preview/gates update.
	async function saveLateFeeConfig() {
		if (!invoice || lateFeeConfigSaving) return;
		// `lateFeeValueDraft` is a NUMBER when the type="number" Input is bound (Svelte coerces
		// bind:value), or a string on first seed / when empty. Normalize without assuming a string.
		const raw = lateFeeValueDraft;
		const val = raw === '' || raw == null ? null : Number(raw);
		if (lateFeeEnabledDraft && (val == null || !Number.isFinite(val) || val <= 0)) {
			toast.error(
				lateFeeTypeDraft === 'flat'
					? 'Enter a flat fee greater than 0'
					: 'Enter a percentage greater than 0'
			);
			return;
		}
		lateFeeConfigSaving = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/late-fee-config`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabled: lateFeeEnabledDraft, type: lateFeeTypeDraft, value: val })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not save late fee terms');
				return;
			}
			toast.success('Late fee terms saved');
			await refresh();
		} catch {
			toast.error('Network error');
		} finally {
			lateFeeConfigSaving = false;
		}
	}

	// --- Late fees (M8) --- applied/removed via /late-fee; not part of the draft Save flow.
	let lateFeeBusy = $state(false);

	async function addLateFee() {
		if (!invoice || lateFeeBusy) return;
		lateFeeBusy = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/late-fee`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not add late fee');
				return;
			}
			toast.success('Late fee added');
			await refresh();
		} catch {
			toast.error('Network error');
		} finally {
			lateFeeBusy = false;
		}
	}

	async function removeLateFee() {
		if (!invoice || lateFeeBusy) return;
		lateFeeBusy = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/late-fee`, { method: 'DELETE' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Could not remove late fee');
				return;
			}
			toast.success('Late fee removed');
			await refresh();
		} catch {
			toast.error('Network error');
		} finally {
			lateFeeBusy = false;
		}
	}

	$effect(() => {
		if (invoice && initializedForId !== invoice.id) {
			initDrafts(invoice);
		}
	});

	let catalogOpen = $state(false);
	let sendOpen = $state(false);
	let paymentOpen = $state(false);
	let linkOpen = $state(false);
	let cancelOpen = $state(false);
	let saving = $state(false);
	let cancelling = $state(false);

	// Edit-after-send: the contractor has re-opened an already-sent (sent / partially_paid / overdue)
	// invoice to amend it. Draft invoices are edited without this toggle (always editable).
	let editMode = $state(false);
	// Set once any section save lands while in edit-after-send mode, so the follow-up re-send is
	// framed as a revision. Reset on send / exit.
	let editedAfterSend = $state(false);
	// Section-block editing (Jobber pattern, same as Quotes / our Jobs page): each card carries ONE
	// pencil that opens the WHOLE block with a Save/Cancel scoped to that card. Only one open at a
	// time. `pricing` covers line items + discount (they recompute totals together).
	let editingSection = $state<'details' | 'notes' | 'terms' | 'pricing' | null>(null);
	// Save state for the text sections (Details / Notes / Terms). Pricing uses `saving` via savePricing().
	let sectionSaving = $state(false);
	let sectionError = $state<string | null>(null);
	// Kept as a derived so all the totals-preview / line-item refs below read one `pricingEditing` flag.
	const pricingEditing = $derived(editingSection === 'pricing');

	const isDraft = $derived(invoice?.status === 'draft');
	const isCancelled = $derived(invoice?.status === 'cancelled');
	const isPaid = $derived(invoice?.status === 'paid');
	// Intrinsically editable = draft (edits inline immediately). A sent / partially_paid / overdue
	// invoice unlocks editing via the header "Edit" (edit-after-send). Paid / cancelled stay locked.
	const canResend = $derived(
		invoice?.status === 'sent' ||
			invoice?.status === 'partially_paid' ||
			invoice?.status === 'overdue'
	);
	const alwaysEditable = $derived(isDraft);
	const isEditable = $derived(alwaysEditable || editMode);

	const canEditPerm = $derived(member().can_create_invoices);
	const canSendPerm = $derived(member().can_send_invoices);
	const canCancelPerm = $derived(member().can_delete_invoices);
	// Edit-after-send is offered while the invoice is still collectible (sent / partial / overdue)
	// and the member can edit invoices.
	const canEnterEditMode = $derived(canResend && canEditPerm);
	// A section can be edited when editing is unlocked and the member can edit. A NEW section can
	// only be opened when none is already open.
	const canEditSection = $derived(isEditable && canEditPerm);
	const canStartSection = $derived(canEditSection && editingSection === null);
	// Non-late-fee line count for the saved (read-only) view of the Line items card.
	const savedLineCount = $derived(
		invoice ? invoice.line_items.filter((li) => !li.is_late_fee).length : 0
	);

	const canCollect = $derived(
		invoice && !isDraft && !isCancelled && !isPaid && Number(invoice.amount_due) > 0
	);
	const overdue = $derived(
		invoice ? isEffectivelyOverdue(invoice.status, invoice.due_date, invoice.amount_due) : false
	);
	const depositPayment = $derived(
		invoice?.payments?.find(
			(p) => p.payment_method === 'stripe' && p.notes?.startsWith('Deposit applied from Quote')
		) ?? null
	);

	// Late fee (M8) gating. Effective gate = org master switch AND this invoice opting in. An
	// applied fee shows a Remove link; an overdue, opted-in invoice with none shows the Add prompt.
	// The amount comes from the INVOICE's own snapshot terms (Phase 2), not the org config.
	const hasLateFee = $derived(invoice ? Number(invoice.late_fee_total) > 0 : false);
	const lateFeeEffective = $derived(
		!!invoice && org().late_fee_enabled && invoice.late_fee_enabled
	);
	const canAddLateFee = $derived(lateFeeEffective && overdue && !hasLateFee);
	const lateFeePreview = $derived.by(() => {
		if (!invoice) return '';
		if (invoice.late_fee_type === 'flat') {
			const v = Number(invoice.late_fee_value ?? 0);
			return v > 0 ? `Add a ${formatCurrency(v)} late fee.` : 'Set a late fee amount below first.';
		}
		const pct = Number(invoice.late_fee_value ?? 0);
		if (pct <= 0) return 'Set a late fee amount below first.';
		const est = Math.round(Number(invoice.amount_due) * (pct / 100) * 100) / 100;
		return `Add a ${pct}% late fee (${formatCurrency(est)}).`;
	});
	const lateFeeConfigDirty = $derived.by(() => {
		if (!invoice) return false;
		if (lateFeeEnabledDraft !== invoice.late_fee_enabled) return true;
		if (lateFeeTypeDraft !== (invoice.late_fee_type === 'flat' ? 'flat' : 'percent')) return true;
		// Compare numerically so "5" (typed) and "5.00" (stored) don't read as different.
		const draftVal =
			lateFeeValueDraft === '' || lateFeeValueDraft == null ? null : Number(lateFeeValueDraft);
		const invVal = invoice.late_fee_value == null ? null : Number(invoice.late_fee_value);
		return draftVal !== invVal;
	});

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
	// Invoice-level discount preview (live), applied to the base subtotal before tax. Fixed is
	// clamped to the subtotal; percent to 100%. Mirrors recalcInvoiceTotals + the quote page.
	const discountValueNum = $derived.by(() => {
		const n = Number(discountValueDraft);
		return Number.isFinite(n) ? n : NaN;
	});
	const discountAmount = $derived.by(() => {
		if (discountTypeDraft === 'none' || !Number.isFinite(discountValueNum)) return 0;
		if (discountTypeDraft === 'percent') {
			return Math.round(subtotal * Math.min(discountValueNum, 100)) / 100;
		}
		return Math.min(discountValueNum, subtotal);
	});
	const discountedSubtotal = $derived(Math.round((subtotal - discountAmount) * 100) / 100);
	// Tax applies ONLY to taxable lines (QuickBooks/Jobber model). The invoice-level discount is
	// allocated proportionally across the subtotal, so tax is charged on the taxable share of the
	// discounted amount (mirrors recalcInvoiceTotals). Collapses to taxable_subtotal × rate when
	// there's no discount, and to discounted × rate when every line is taxable.
	const taxableSubtotal = $derived(
		lineItems.reduce((s, li) => {
			if (li.taxable === false) return s;
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
	const total = $derived(Math.round((discountedSubtotal + taxAmount) * 100) / 100);

	// Key-dates row for the shared document header. Due mirrors the quote's "Expires"
	// slot (danger tone once overdue); Sent/Paid appear as they happen.
	const headerDates = $derived.by<DocumentHeaderDate[]>(() => {
		const inv = invoice;
		if (!inv) return [];
		const out: DocumentHeaderDate[] = [{ label: 'Issued', value: formatDate(inv.created_at) }];
		if (inv.due_date) {
			out.push({
				label: 'Due',
				value: formatDate(inv.due_date),
				tone: overdue ? 'danger' : 'default'
			});
		}
		if (inv.sent_at) out.push({ label: 'Sent', value: formatDate(inv.sent_at) });
		if (inv.paid_at) out.push({ label: 'Paid', value: formatDate(inv.paid_at), tone: 'success' });
		return out;
	});

	// Open a section for block editing — re-seed every draft from the saved invoice first so the
	// inputs reflect current values, then flip the section on.
	function startSection(name: 'details' | 'notes' | 'terms' | 'pricing') {
		if (!canStartSection || !invoice) return;
		initDrafts(invoice);
		sectionError = null;
		editingSection = name;
	}
	// Cancel the open section — discard drafts by re-seeding from the saved invoice.
	function cancelSection() {
		if (invoice) initDrafts(invoice);
		editingSection = null;
		sectionError = null;
	}

	// Friendly label for the header edit bar, and one save flag both the header bar and the
	// in-card footer read so they can never spin out of sync (text sections use `sectionSaving`,
	// pricing uses `saving`).
	const SECTION_LABELS = { details: 'Details', notes: 'Notes', terms: 'Terms', pricing: 'Pricing' };
	const sectionBusy = $derived(pricingEditing ? saving : sectionSaving);
	// Header Save dispatches to whichever block is open (only one is ever open at a time), so the
	// same validation + payment-safety rails run as the in-card Save.
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
		}
	}

	// Generic PATCH + close for the text sections (Details / Notes / Terms). On success re-seeds all
	// drafts, closes the section, and (in edit-after-send) flags the follow-up re-send as a revision.
	// Inline `sectionError` keeps the card open on failure.
	async function commitSection(payload: Record<string, unknown>) {
		if (!invoice) return;
		sectionSaving = true;
		sectionError = null;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}`, {
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

	// Details block: title (required) + tax rate + due date, saved together.
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
			tax_rate: n / 100,
			due_date: dueDateDraft.trim() || null
		});
	}
	// Notes block: client-facing notes.
	function saveNotes() {
		void commitSection({ notes: notesDraft.trim() || null });
	}
	// Terms block.
	function saveTerms() {
		void commitSection({ terms: termsDraft.trim() || null });
	}

	// Exit edit-after-send. Re-send (revision) is a separate explicit action, matching Jobber / HCP.
	function exitEditMode() {
		cancelSection();
		editMode = false;
		editedAfterSend = false;
	}

	let pdfBusy = $state(false);
	async function downloadPdf() {
		if (!invoice || pdfBusy) return;
		pdfBusy = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/pdf`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.data?.url) {
				toast.error(body.error ?? 'Could not generate PDF');
				return;
			}
			window.open(body.data.url as string, '_blank');
		} finally {
			pdfBusy = false;
		}
	}

	async function refresh() {
		await invoicesStore.loadDetail(data.id, true);
		const latest = invoicesStore.getDetail(data.id);
		if (latest) {
			initDrafts(latest);
			invoicesStore.update({
				id: latest.id,
				status: latest.status,
				total: latest.total,
				amount_paid: latest.amount_paid,
				amount_due: latest.amount_due,
				sent_at: latest.sent_at,
				paid_at: latest.paid_at
			});
		}
	}

	// Pricing section (line items + invoice-level discount) — they recompute totals together, so
	// they save as ONE unit behind the Line-items card's Edit pencil. Deliberately scoped to the
	// money block: title / tax / due / notes / terms save via their own sections, so a cancelled
	// text-section draft can never leak into a pricing save. On a sent invoice the server enforces
	// the payment-safety rails (total can't drop below money paid; a stale payment link is retired).
	async function savePricing() {
		if (!invoice || !pricingEditing) return;
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
		if (discountTypeDraft !== 'none') {
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

		saving = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					discount_type: discountTypeDraft,
					discount_value: discountTypeDraft === 'none' ? null : discountValueNum,
					discount_label: discountTypeDraft === 'none' ? null : discountLabelDraft.trim() || null,
					line_items: lineItems.map((li, idx) => ({
						description: li.description.trim(),
						quantity: Number(li.quantity),
						unit: li.unit?.trim() || null,
						unit_price: Number(li.unit_price),
						taxable: li.taxable ?? true,
						unit_cost:
							li.unit_cost != null && String(li.unit_cost).trim() !== ''
								? Number(li.unit_cost)
								: null,
						source_catalog_item_id: li.source_catalog_item_id ?? null,
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
			if (editMode) editedAfterSend = true;
			editingSection = null;
			toast.success('Invoice saved');
		} catch {
			toast.error('Network error');
		} finally {
			saving = false;
		}
	}

	// All four dialogs are click-gated — load them lazily so the invoice detail
	// shell paints instantly; each chunk fetches the first time it opens.
	let SendInvoiceDialog = $state<
		typeof import('$lib/components/documents/SendDocumentDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!sendOpen || SendInvoiceDialog) return;
		void import('$lib/components/documents/SendDocumentDialog.svelte').then((m) => {
			SendInvoiceDialog = m.default;
		});
	});

	let RecordPaymentDialog = $state<
		typeof import('$lib/components/invoices/RecordPaymentDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!paymentOpen || RecordPaymentDialog) return;
		void import('$lib/components/invoices/RecordPaymentDialog.svelte').then((m) => {
			RecordPaymentDialog = m.default;
		});
	});

	let PaymentLinkDialog = $state<
		typeof import('$lib/components/invoices/PaymentLinkDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!linkOpen || PaymentLinkDialog) return;
		void import('$lib/components/invoices/PaymentLinkDialog.svelte').then((m) => {
			PaymentLinkDialog = m.default;
		});
	});

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	$effect(() => {
		if (!cancelOpen || ConfirmDialog) return;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	async function cancelInvoice() {
		if (!invoice) return;
		cancelling = true;
		try {
			const res = await fetch(`/api/invoices/${invoice.id}/cancel`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Failed to cancel');
				return;
			}
			toast.success('Invoice cancelled');
			await refresh();
		} finally {
			cancelling = false;
		}
	}
</script>

<svelte:head><title>{invoice ? invoice.invoice_number_display : 'Invoice'}</title></svelte:head>

<!-- Shared Cancel + Save row for the text sections (Details / Notes / Terms). -->
{#snippet sectionFooter(onSave: () => void)}
	<EditActionBar
		{onSave}
		onCancel={cancelSection}
		saving={sectionSaving}
		error={sectionError}
		size="sm"
	/>
{/snippet}

{#if showSkeleton}
	<PageWrapper title="Invoice" back="/invoices">
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
{:else if !invoice}
	<PageWrapper title="Invoice" back="/invoices">
		<p class="invoice-detail__error">{detailError ?? 'Not found'}</p>
	</PageWrapper>
{:else}
	{@const inv = invoice}
	<PageWrapper title={inv.invoice_number_display} back="/invoices">
		{#snippet actions()}
			{#if editingSection !== null}
				<!-- A block is being edited — mirror its Save/Cancel up here so it's reachable
				     no matter how far the card is scrolled. Same handlers as the in-card footer. -->
				<EditActionBar
					onSave={saveCurrentSection}
					onCancel={cancelSection}
					saving={sectionBusy}
					error={sectionError}
					label={`Editing ${SECTION_LABELS[editingSection]}`}
				/>
			{:else if alwaysEditable}
				<!-- Draft: fields edit inline per card; the header only sends. -->
				{#if canSendPerm}
					<button
						type="button"
						class="btn btn--primary"
						onclick={() => (sendOpen = true)}
						disabled={savedLineCount === 0}
					>
						<i class="ri-send-plane-line" aria-hidden="true"></i>Send
					</button>
				{/if}
			{:else if editMode}
				<!-- Edit-after-send unlocked: edits save per card; re-send when done. -->
				{#if canResend && canSendPerm}
					<Button type="button" onclick={() => (sendOpen = true)}>
						<i class="ri-send-plane-line" aria-hidden="true"></i>Re-send
					</Button>
				{/if}
				<Button type="button" variant="outline" onclick={exitEditMode}>Done</Button>
			{:else}
				<!-- Sent / partially paid / overdue, locked view: re-open to amend, collect, or resend. -->
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
				{#if canCollect}
					<Button type="button" variant="outline" onclick={() => (linkOpen = true)}>
						<i class="ri-link" aria-hidden="true"></i>Payment link
					</Button>
					<Button type="button" onclick={() => (paymentOpen = true)}>
						<i class="ri-bank-card-line" aria-hidden="true"></i>Record payment
					</Button>
				{/if}
			{/if}
			{#if editingSection === null}
				{@const showPdf = !isDraft}
				{@const showCancel = !isDraft && !isCancelled && !isPaid && canCancelPerm}
				{#if showPdf || showCancel}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger class="btn btn--icon btn--outline" aria-label="More actions">
							<i class="ri-more-2-fill" aria-hidden="true"></i>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#if showPdf}
								<DropdownMenu.Item closeOnSelect={false} onclick={downloadPdf} disabled={pdfBusy}>
									{#if pdfBusy}
										<i
											class="ri-loader-4-line"
											aria-hidden="true"
											style="animation: spin 1s linear infinite;"
										></i> Preparing PDF…
									{:else}
										<i class="ri-download-line" aria-hidden="true"></i> Download PDF
									{/if}
								</DropdownMenu.Item>
							{/if}
							{#if showCancel}
								{#if showPdf}<DropdownMenu.Separator />{/if}
								<DropdownMenu.Item
									class="dropdown__item--danger"
									onclick={() => (cancelOpen = true)}
								>
									<i class="ri-forbid-line" aria-hidden="true"></i> Cancel invoice
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			{/if}
		{/snippet}

		<DocumentDetailShell>
			{#snippet main()}
				<!-- Progress strip -->
				{#if isDraft}
					<div class="card invoice-detail__progress-wrap">
						<QuoteProgressStrip current="build" />
					</div>
				{/if}

				<!-- Document header card -->
				<DocumentHeaderCard
					name={inv.contact_name}
					meta={`${inv.contact_phone}${inv.contact_email ? ` · ${inv.contact_email}` : ''}`}
					noEmail={!inv.contact_email}
					dates={headerDates}
				>
					{#snippet badge()}
						<InvoiceStatusBadge status={inv.status} />
					{/snippet}
					{#snippet chips()}
						{#if overdue}
							<span class="invoice-detail__overdue">
								<i class="ri-error-warning-line" aria-hidden="true"></i>Overdue
							</span>
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
								<span class="invoice-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if editingSection === 'details'}
						<div class="doc-form">
							<div class="field">
								<label class="field__label" for="invoice-title">Title</label>
								<!-- svelte-ignore a11y_autofocus -->
								<Input id="invoice-title" class="field__input" bind:value={titleDraft} autofocus />
							</div>
							<div class="field">
								<label class="field__label" for="invoice-tax">Tax rate (%)</label>
								<Input
									id="invoice-tax"
									type="number"
									inputmode="decimal"
									min="0"
									max="100"
									step="0.01"
									class="field__input"
									bind:value={taxRateDraft}
								/>
							</div>
							<div class="field">
								<span class="field__label">Due date</span>
								<Calendar bind:value={dueDateDraft} placeholder="Pick due date" />
							</div>
							{@render sectionFooter(saveDetails)}
						</div>
					{:else}
						<dl class="doc-facts">
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Title</dt>
								<dd class="doc-facts__value">{inv.title}</dd>
							</div>
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Tax rate</dt>
								<dd class="doc-facts__value">{+(Number(inv.tax_rate) * 100).toFixed(4)}%</dd>
							</div>
							<div class="doc-facts__row">
								<dt class="doc-facts__label">Due date</dt>
								<dd class="doc-facts__value">
									{#if inv.due_date}
										{formatDate(inv.due_date)}
									{:else}
										<span class="doc-inline-muted">No due date</span>
									{/if}
								</dd>
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
								<span class="invoice-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if editingSection === 'notes'}
						<div class="doc-form">
							<div class="field">
								<label class="field__label" for="invoice-notes">Client notes</label>
								<p class="field__hint">Visible to the customer on their invoice.</p>
								<Textarea
									id="invoice-notes"
									class="field__input"
									bind:value={notesDraft}
									rows={3}
									placeholder="e.g. Thank you for your business!"
								/>
							</div>
							{@render sectionFooter(saveNotes)}
						</div>
					{:else if inv.notes}
						<span class="doc-inline-pre">{inv.notes}</span>
					{:else}
						<span class="doc-inline-muted">Visible to the customer - none yet</span>
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
								<span class="invoice-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					{#if editingSection === 'terms'}
						<div class="doc-form">
							<div class="field">
								<p class="field__hint">
									Your fine print for this invoice (payment terms, late fees, warranty). Shown to
									the customer on their invoice and on the PDF. Prefilled from your default in
									Settings — edit it here for just this invoice.
								</p>
								<Textarea
									id="invoice-terms"
									class="field__input"
									bind:value={termsDraft}
									rows={6}
									placeholder="e.g. Payment due within 15 days. A 1.5% monthly late fee applies to overdue balances."
								/>
							</div>
							{@render sectionFooter(saveTerms)}
						</div>
					{:else if inv.terms}
						<span class="doc-inline-pre">{inv.terms}</span>
					{:else}
						<span class="doc-inline-muted">
							Shown to the customer on their invoice and on the PDF - none yet
						</span>
					{/if}
				</DocumentSectionCard>

				<!-- Line items card (pricing section-block edit) -->
				<DocumentSectionCard
					flush
					title="Line items"
					count={pricingEditing ? lineItems.length : savedLineCount}
				>
					{#snippet actions()}
						{#if pricingEditing}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => (catalogOpen = true)}
							>
								<i class="ri-book-open-line" aria-hidden="true"></i>
								<span class="invoice-detail__btn-label">Price book</span>
							</button>
						{:else if canStartSection}
							<button
								type="button"
								class="btn btn--sm btn--outline"
								onclick={() => startSection('pricing')}
							>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span class="invoice-detail__btn-label">Edit</span>
							</button>
						{/if}
					{/snippet}
					<LineItemEditor
						bind:lineItems
						readonly={!pricingEditing}
						enableTax
						enableCatalog
						externalCatalogTrigger
						bind:catalogOpen
						showCost={member().can_view_revenue}
						targetMarginPct={org().target_margin_pct}
					/>
					{#if pricingEditing}
						<EditActionBar
							onSave={() => void savePricing()}
							onCancel={cancelSection}
							{saving}
							size="sm"
							variant="card"
						/>
					{/if}
				</DocumentSectionCard>
			{/snippet}

			{#snippet sidebar()}
				<!-- Totals — live preview while the pricing block is open, saved figures otherwise. -->
				<DocumentTotalsCard
					subtotal={pricingEditing ? subtotal.toFixed(2) : inv.subtotal}
					discount_type={pricingEditing ? discountTypeDraft : inv.discount_type}
					discount_value={pricingEditing ? discountValueDraft || null : inv.discount_value}
					discount_amount={pricingEditing ? discountAmount.toFixed(2) : inv.discount_amount}
					discount_label={pricingEditing ? discountLabelDraft || null : inv.discount_label}
					tax_rate={pricingEditing ? taxRateNum.toFixed(4) : inv.tax_rate}
					tax_amount={pricingEditing ? taxAmount.toFixed(2) : inv.tax_amount}
					total={pricingEditing ? total.toFixed(2) : inv.total}
					amount_paid={pricingEditing ? null : inv.amount_paid}
					amount_due={pricingEditing ? null : inv.amount_due}
					tip_total={pricingEditing ? null : inv.tip_total}
					late_fee_total={pricingEditing ? null : inv.late_fee_total}
				/>

				<!-- Late fee (M8): ONE card — policy + overdue "apply now" + applied state.
				     Shown while the org has late fees on and the invoice is still collectible. -->
				{#if org().late_fee_enabled && !isPaid && !isCancelled && invoice}
					<div class="invoice-latefee-config">
						{#if hasLateFee}
							<!-- Applied: collapsed summary + remove -->
							<div class="invoice-latefee-config__row">
								<div class="invoice-latefee-config__text">
									<p class="invoice-latefee-config__title">Late fee applied</p>
									<p class="invoice-latefee-config__hint">
										{formatCurrency(Number(invoice.late_fee_total))} added to the balance owed.
									</p>
								</div>
								<button
									type="button"
									class="invoice-latefee-config__remove"
									onclick={removeLateFee}
									disabled={lateFeeBusy}
								>
									{#if lateFeeBusy}
										<i
											class="ri-loader-4-line"
											aria-hidden="true"
											style="animation: spin 1s linear infinite;"
										></i>
										Removing…
									{:else}
										<i class="ri-close-line" aria-hidden="true"></i>Remove
									{/if}
								</button>
							</div>
						{:else}
							<!-- Terms: toggle + type + amount (per-invoice snapshot) -->
							<div class="invoice-latefee-config__row">
								<div class="invoice-latefee-config__text">
									<p class="invoice-latefee-config__title">Charge a late fee if overdue</p>
									<p class="invoice-latefee-config__hint">
										{#if lateFeeEnabledDraft}
											Applied automatically {org().late_fee_grace_days} day{org()
												.late_fee_grace_days === 1
												? ''
												: 's'} after the due date.
										{:else}
											Off for this invoice. No late fee will be charged.
										{/if}
									</p>
								</div>
								<Switch bind:checked={lateFeeEnabledDraft} disabled={lateFeeConfigSaving} />
							</div>

							{#if lateFeeEnabledDraft}
								<div class="invoice-latefee-config__types">
									<label class="invoice-latefee-config__type">
										<input
											type="radio"
											bind:group={lateFeeTypeDraft}
											value="percent"
											disabled={lateFeeConfigSaving}
										/>
										% of balance
									</label>
									<label class="invoice-latefee-config__type">
										<input
											type="radio"
											bind:group={lateFeeTypeDraft}
											value="flat"
											disabled={lateFeeConfigSaving}
										/>
										Flat amount
									</label>
								</div>
								<div class="invoice-latefee-config__amount">
									{#if lateFeeTypeDraft === 'flat'}
										<span class="invoice-latefee-config__unit">$</span>
										<Input
											type="number"
											inputmode="decimal"
											min="0"
											step="0.01"
											placeholder="e.g. 25"
											bind:value={lateFeeValueDraft}
											disabled={lateFeeConfigSaving}
										/>
									{:else}
										<Input
											type="number"
											inputmode="decimal"
											min="0"
											max="100"
											step="0.01"
											placeholder="e.g. 5"
											bind:value={lateFeeValueDraft}
											disabled={lateFeeConfigSaving}
										/>
										<span class="invoice-latefee-config__unit">% of the unpaid balance</span>
									{/if}
								</div>
							{/if}

							{#if lateFeeConfigDirty}
								<button
									type="button"
									class="btn btn--sm btn--primary invoice-latefee-config__save"
									onclick={saveLateFeeConfig}
									disabled={lateFeeConfigSaving}
								>
									{lateFeeConfigSaving ? 'Saving…' : 'Save late fee terms'}
								</button>
							{/if}

							<!-- Overdue: secondary "apply now" action inside the same card, so the
							     contractor can charge it without waiting out the grace period. -->
							{#if canAddLateFee}
								<div class="invoice-latefee-config__overdue">
									<p class="invoice-latefee-config__overdue-text">
										<i class="ri-error-warning-line" aria-hidden="true"></i>
										This invoice is overdue. {lateFeePreview}
									</p>
									<button
										type="button"
										class="invoice-latefee-config__apply"
										onclick={addLateFee}
										disabled={lateFeeBusy}
									>
										{#if lateFeeBusy}
											<i
												class="ri-loader-4-line"
												aria-hidden="true"
												style="animation: spin 1s linear infinite;"
											></i>
											Applying…
										{:else}
											Apply now
										{/if}
									</button>
								</div>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Discount (part of the pricing block — editable while the line items are open) -->
				{#if pricingEditing}
					<DocumentDiscountEditor
						bind:type={discountTypeDraft}
						bind:value={discountValueDraft}
						bind:label={discountLabelDraft}
						{subtotal}
					/>
				{/if}

				<!-- Deposit applied -->
				{#if depositPayment}
					<div class="invoice-deposit">
						<div class="invoice-deposit__icon">
							<i class="ri-check-line" aria-hidden="true"></i>
						</div>
						<div class="invoice-deposit__body">
							<p class="invoice-deposit__title">Deposit applied</p>
							<p class="invoice-deposit__desc">
								{formatCurrency(depositPayment.amount)} · collected {formatDate(
									depositPayment.paid_at
								)} · via Stripe
							</p>
						</div>
					</div>
				{/if}

				<!-- Payment history -->
				{#if !isDraft}
					<PaymentHistory payments={inv.payments} />
				{/if}

				<!-- Automatic payment reminders (per-invoice opt-out) -->
				{#if !isCancelled && !isPaid}
					<div class="invoice-reminders-card">
						<div class="invoice-reminders-card__row">
							<div class="invoice-reminders-card__text">
								<p class="invoice-reminders-card__title">Automatic payment reminders</p>
								{#if reminderOrgEnabled && reminderSummary}
									<p class="invoice-reminders-card__hint">{reminderSummary}</p>
								{:else}
									<p class="invoice-reminders-card__hint">
										Turned off for your account.
										<a href="/settings/automation">Turn on →</a>
									</p>
								{/if}
							</div>
							<Switch
								bind:checked={sendReminders}
								disabled={remindersSaving}
								onchange={toggleReminders}
							/>
						</div>
						{#if reminderOrgEnabled && reminderSummary}
							<a class="invoice-reminders-card__link" href="/settings/automation">Edit schedule →</a
							>
						{/if}
					</div>
				{/if}

				<!-- Accept tips (per-invoice opt-out; org tips_enabled is the master gate) -->
				{#if !isCancelled && !isPaid}
					<div class="invoice-reminders-card">
						<div class="invoice-reminders-card__row">
							<div class="invoice-reminders-card__text">
								<p class="invoice-reminders-card__title">Accept tips</p>
								{#if org().tips_enabled}
									<p class="invoice-reminders-card__hint">
										Let this client add a tip when they pay online.
									</p>
								{:else}
									<p class="invoice-reminders-card__hint">
										Turned off for your account.
										<a href="/settings/stripe">Turn on →</a>
									</p>
								{/if}
							</div>
							<Switch
								bind:checked={acceptTips}
								disabled={tipsSaving || !org().tips_enabled}
								onchange={toggleTips}
							/>
						</div>
					</div>
				{/if}

				<!-- Attachments -->
				<AttachmentList
					parentFk={{ invoice_id: inv.id }}
					purposeTag="invoice_attachment"
					canUpload={member().can_upload_files}
					canDelete={member().can_upload_files}
				/>
			{/snippet}
		</DocumentDetailShell>

		{#if SendInvoiceDialog}
			<SendInvoiceDialog
				bind:open={sendOpen}
				kind="invoice"
				documentId={inv.id}
				numberDisplay={inv.invoice_number_display}
				subtitle={Number(inv.amount_due) !== Number(inv.total)
					? `Balance ${formatCurrency(inv.amount_due)} of ${formatCurrency(inv.total)}`
					: `Total ${formatCurrency(inv.total)}`}
				amountForTokens={formatCurrency(inv.amount_due)}
				contactName={inv.contact_name}
				contactEmail={inv.contact_email}
				contactPhone={inv.contact_phone}
				contactSmsOptOut={inv.contact_sms_opt_out}
				mode={isDraft ? 'send' : 'resend'}
				onSent={() => {
					void refresh();
				}}
			/>
		{/if}

		{#if RecordPaymentDialog}
			<RecordPaymentDialog
				bind:open={paymentOpen}
				invoiceId={inv.id}
				amountDue={inv.amount_due}
				tipsEnabled={org().tips_enabled && inv.accept_tips}
				onRecorded={() => {
					void refresh();
				}}
			/>
		{/if}

		{#if PaymentLinkDialog}
			<PaymentLinkDialog
				bind:open={linkOpen}
				invoiceId={inv.id}
				existingUrl={inv.stripe_payment_link_url}
			/>
		{/if}

		{#if ConfirmDialog}
			<ConfirmDialog
				bind:open={cancelOpen}
				title="Cancel invoice?"
				description="The customer will no longer be able to pay this invoice. This cannot be undone."
				confirmLabel="Cancel invoice"
				cancelLabel="Keep open"
				variant="destructive"
				loading={cancelling}
				onConfirm={cancelInvoice}
			/>
		{/if}
	</PageWrapper>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.invoice-detail {
		&__progress-wrap {
			padding: $space-3 $space-4;
		}

		// Collapse the Price-book button to its icon on narrow screens.
		&__btn-label {
			@media (max-width: #{$bp-tablet - 1px}) {
				display: none;
			}
		}

		// Overdue chip injected into the shared DocumentHeaderCard status row.
		&__overdue {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			padding: 2px $space-2;
			border-radius: $radius-full;
			font-size: $fs-caption;
			font-weight: $weight-medium;
			line-height: $lh-caption;
			background: rgba(244, 63, 94, 0.12);
			color: #be123c;

			i {
				font-size: 1.3rem;
			}
		}

		&__error {
			font-size: $fs-body;
			color: var(--danger-text);
		}
	}

	// Match the quote detail's slightly tighter field rhythm inside the section cards.
	.field {
		gap: $space-1;

		&__hint {
			font-size: $fs-caption;
			color: var(--color-text-muted);
			margin-top: -2px;
		}
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.invoice-deposit {
		display: flex;
		align-items: flex-start;
		gap: $space-3;
		padding: $space-4;
		border-radius: $radius-xl;
		background: var(--success-bg);
		box-shadow: var(--shadow-sm);

		&__icon {
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			width: 32px;
			height: 32px;
			margin-top: 2px;
			border-radius: $radius-full;
			background: rgba(16, 185, 129, 0.2);
			color: var(--success-text);

			i {
				font-size: 1.3rem;
			}
		}

		&__body {
			min-width: 0;
			flex: 1;
		}

		&__title {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--success-text);
		}

		&__desc {
			margin-top: $space-1;
			font-size: $fs-body;
			color: var(--success-text);
		}
	}

	// Per-invoice automatic-reminders card in the sidebar.
	.invoice-reminders-card {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		padding: $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-xl;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-sm);

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
		}

		&__text {
			min-width: 0;
		}

		&__title {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__hint {
			margin-top: 2px;
			font-size: $fs-caption;
			color: var(--color-text-muted);

			a {
				color: var(--color-brand);
				font-weight: $weight-medium;
			}
		}

		&__link {
			width: fit-content;
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: var(--color-brand);

			&:hover {
				text-decoration: underline;
			}
		}
	}

	// Late fee (M8): overdue prompt + the applied-fee remove link.
	// Late fee (M8): single card — policy editor, overdue apply-now, and applied state.
	.invoice-latefee-config {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		padding: $space-4;
		border: 1px solid var(--color-border);
		border-radius: $radius-xl;
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-sm);

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
		}

		&__text {
			min-width: 0;
		}

		&__title {
			font-size: $fs-body;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__hint {
			margin-top: 2px;
			font-size: $fs-caption;
			color: var(--color-text-muted);
		}

		&__types {
			display: flex;
			flex-wrap: wrap;
			gap: $space-3;
		}

		&__type {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			font-size: $fs-caption;
			color: var(--color-text-primary);
			cursor: pointer;
		}

		&__amount {
			display: flex;
			align-items: center;
			gap: $space-2;
		}

		&__unit {
			font-size: $fs-caption;
			color: var(--color-text-muted);
			white-space: nowrap;
		}

		&__save {
			width: fit-content;
		}

		// Remove link on the applied state.
		&__remove {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			flex-shrink: 0;
			padding: $space-1 0;
			font-size: $fs-caption;
			font-weight: $weight-medium;
			color: var(--color-text-muted);
			background: none;
			border: none;
			cursor: pointer;

			&:hover:not(:disabled) {
				color: var(--danger-text);
			}

			&:disabled {
				cursor: not-allowed;
				opacity: 0.6;
			}
		}

		// Overdue callout + "apply now", nested inside the same card.
		&__overdue {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-3;
			margin-top: $space-1;
			padding: $space-3;
			border-radius: $radius-lg;
			background: var(--danger-bg);
		}

		&__overdue-text {
			display: flex;
			align-items: center;
			gap: $space-1;
			min-width: 0;
			font-size: $fs-caption;
			color: var(--danger-text);
		}

		&__apply {
			display: inline-flex;
			align-items: center;
			gap: $space-1;
			flex-shrink: 0;
			padding: $space-1 $space-3;
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			color: #fff;
			background: var(--danger-text);
			border: none;
			border-radius: $radius-full;
			cursor: pointer;

			&:disabled {
				cursor: not-allowed;
				opacity: 0.6;
			}
		}
	}
</style>
