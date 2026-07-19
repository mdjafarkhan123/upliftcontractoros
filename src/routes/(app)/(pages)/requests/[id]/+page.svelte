<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import EditPencil from '$lib/components/shared/EditPencil.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import InlineEditRow from '$lib/components/shared/InlineEditRow.svelte';
	import { InlineEditController } from '$lib/components/shared/inlineEditController.svelte';
	import EditActionBar from '$lib/components/shared/EditActionBar.svelte';
	import RowActionsMenu, { type RowAction } from '$lib/components/shared/RowActionsMenu.svelte';
	import { Button } from '$lib/components/ui/button';
	import RequestStatusBadge from '$lib/components/requests/RequestStatusBadge.svelte';
	import RequestAssessmentEditor from '$lib/components/requests/RequestAssessmentEditor.svelte';
	import RequestConvertDialog from '$lib/components/requests/RequestConvertDialog.svelte';
	import LineItemEditor from '$lib/components/quotes/LineItemEditor.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { requestDetailStore } from '$lib/stores/requestDetail.svelte';
	import { requestsStore } from '$lib/stores/requests.svelte';
	import { requestStatsStore } from '$lib/stores/requestStats.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { formatCurrency } from '$lib/utils/format';
	import type { RequestDetail } from '$lib/types/requests';
	import type { QuoteLineDraft } from '$lib/types/quotes';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const id = $derived(data.id);

	$effect(() => {
		void requestDetailStore.load(id);
	});

	const req = $derived(requestDetailStore.get(id));
	const seed = $derived(requestsStore.getById(id));
	const loadingCold = $derived(requestDetailStore.isLoading(id) && !seed);
	const errorMsg = $derived(requestDetailStore.getError(id));

	const canManage = $derived(member().can_view_full_pipeline);
	const isConverted = $derived(!!req?.converted_at);
	const isArchived = $derived(!!req?.archived_at);
	const needsApproval = $derived(req?.status === 'needs_approval');
	// Inline pencils follow Jobber: a converted request is frozen history and an
	// archived one is closed — both read-only until reopened.
	const canInlineEdit = $derived(canManage && !isConverted && !isArchived);

	// Header shell from the list seed so the page never blanks on a cold open.
	const headerVM = $derived.by(() => {
		if (req) return { name: req.contact.full_name, title: req.title, status: req.status };
		if (seed) return { name: seed.contact.full_name, title: seed.title, status: seed.status };
		return null;
	});

	// ── Assignee names (for the assessment Team display) ─────────────────────────
	let assigneeNames = $state<Record<string, string>>({});
	let assigneesLoaded = false;
	$effect(() => {
		if (!canManage || assigneesLoaded) return;
		assigneesLoaded = true;
		void fetch('/api/appointments/assignees').then(async (r) => {
			if (!r.ok) return;
			const body = (await r.json()) as { assignees: { id: string; full_name: string }[] };
			const map: Record<string, string> = {};
			for (const a of body.assignees) map[a.id] = a.full_name;
			assigneeNames = map;
		});
	});

	// ── Date/time helpers ────────────────────────────────────────────────────────
	function toDateStr(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}
	function toTimeStr(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
	function fmtDateTime(a: RequestDetail['assessment']): string {
		if (!a) return '—';
		if (!a.scheduled_start) return 'Unscheduled';
		const d = fmtDate(a.scheduled_start);
		if (a.all_day) return `${d} · Anytime`;
		return `${d} @ ${new Date(a.scheduled_start).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		})}`;
	}

	// ── Write-through: keep the detail + list stores + stats in lockstep ─────────
	function applyDetail(d: RequestDetail) {
		requestDetailStore.set(id, d);
		requestsStore.update({
			id: d.id,
			title: d.title,
			status: d.status,
			approval_state: d.approval_state,
			converted_to_quote_id: d.converted_to_quote_id,
			converted_to_job_id: d.converted_to_job_id,
			assessment_start: d.assessment?.scheduled_start ?? null
		});
		requestStatsStore.invalidate();
	}

	// ── Inline field editing (title / service details / lead source / notes) ─────
	const editCtl = new InlineEditController();
	let titleDraft = $state('');
	let serviceDraft = $state('');
	let leadSourceDraft = $state('');
	let notesDraft = $state('');

	async function patchRequestField(payload: Record<string, unknown>): Promise<string | null> {
		if (!req) return 'Request not loaded.';
		try {
			const res = await fetch(`/api/requests/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) return body.error ?? 'Could not save.';
			applyDetail(body.data as RequestDetail);
			toast.success('Saved');
			return null;
		} catch {
			return 'Network error. Try again.';
		}
	}

	function rowCtl(key: string, seedFn: () => void, saveFn: () => Promise<string | null>) {
		return {
			editing: editCtl.isEditing(key),
			onRequestEdit: () => {
				if (canInlineEdit && !blockEditing) editCtl.begin(key, seedFn, saveFn);
			},
			onCommit: () => editCtl.commit(),
			onCancel: () => editCtl.cancel()
		};
	}

	function enterTitleEdit() {
		if (!req || !canInlineEdit || blockEditing) return;
		editCtl.begin(
			'title',
			() => (titleDraft = req?.title ?? ''),
			() => {
				if (!titleDraft.trim()) return Promise.resolve('Title is required.');
				return patchRequestField({ title: titleDraft.trim() });
			}
		);
	}
	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void editCtl.commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			editCtl.cancel();
		}
	}

	// ── Overview block edit (service details + lead source together) ─────────────
	let overviewEditing = $state(false);
	let overviewSaving = $state(false);
	let overviewError = $state<string | null>(null);

	function startOverviewEdit() {
		if (!req || !canInlineEdit || blockEditing) return;
		serviceDraft = req.service_details ?? '';
		leadSourceDraft = req.lead_source_answer ?? '';
		overviewError = null;
		overviewEditing = true;
	}
	function cancelOverview() {
		overviewEditing = false;
		overviewError = null;
	}
	async function saveOverview() {
		overviewSaving = true;
		overviewError = null;
		const err = await patchRequestField({
			service_details: serviceDraft.trim() || null,
			lead_source_answer: leadSourceDraft.trim() || null
		});
		overviewSaving = false;
		if (err) {
			overviewError = err;
			toast.error(err);
			return;
		}
		overviewEditing = false;
	}

	// ── Product / Service block edit ─────────────────────────────────────────────
	let pricingEditing = $state(false);
	let pricingSaving = $state(false);
	let pricingError = $state<string | null>(null);
	let lineItems = $state<QuoteLineDraft[]>([]);
	let catalogOpen = $state(false);
	let lineControls = $state<{ addItem: () => void; addSection: () => void } | undefined>(undefined);

	const editSubtotal = $derived(
		lineItems
			.filter((l) => l.description.trim())
			.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
	);

	function startPricingEdit() {
		if (!req || !canInlineEdit || blockEditing) return;
		lineItems = req.line_items.map((li) => ({
			client_id: crypto.randomUUID(),
			line_key: li.line_key,
			description: li.description,
			details: li.details ?? '',
			quantity: li.quantity,
			unit: li.unit ?? '',
			section_label: null,
			unit_price: li.unit_price,
			unit_cost: li.unit_cost,
			taxable: li.taxable,
			source_catalog_item_id: li.source_catalog_item_id
		}));
		pricingError = null;
		pricingEditing = true;
	}
	function cancelPricing() {
		pricingEditing = false;
		pricingError = null;
	}
	async function savePricing() {
		pricingSaving = true;
		pricingError = null;
		const err = await patchRequestField({
			line_items: lineItems
				.filter((l) => l.description.trim())
				.map((l) => ({
					line_key: l.line_key,
					description: l.description.trim(),
					details: l.details?.trim() || null,
					quantity: Number(l.quantity) || 1,
					unit: l.unit?.trim() || null,
					unit_price: Number(l.unit_price) || 0,
					unit_cost: l.unit_cost != null && l.unit_cost !== '' ? Number(l.unit_cost) : null,
					taxable: l.taxable ?? true,
					source_catalog_item_id: l.source_catalog_item_id ?? null
				}))
		});
		pricingSaving = false;
		if (err) {
			pricingError = err;
			toast.error(err);
			return;
		}
		pricingEditing = false;
	}

	// ── On-site assessment block ─────────────────────────────────────────────────
	let assessmentEditing = $state(false);
	let assessmentSaving = $state(false);
	let assessmentError = $state<string | null>(null);
	let instructions = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let scheduleLater = $state(false);
	let anytime = $state(false);
	let crewIds = $state<string[]>([]);
	let leadId = $state<string | null>(null);
	let assessmentFieldErrors = $state<Record<string, string>>({});

	function startAssessmentEdit() {
		if (!req || !canInlineEdit || blockEditing) return;
		const a = req.assessment;
		instructions = a?.notes ?? '';
		scheduleLater = a ? !a.scheduled_start : false;
		anytime = a?.all_day ?? false;
		startDate = toDateStr(a?.scheduled_start ?? null);
		endDate = toDateStr(a?.scheduled_end ?? a?.scheduled_start ?? null);
		startTime = a && !a.all_day ? toTimeStr(a.scheduled_start) : '';
		endTime = a && !a.all_day ? toTimeStr(a.scheduled_end) : '';
		crewIds = a ? [...a.assignee_ids] : [];
		leadId = a?.assigned_to ?? null;
		assessmentFieldErrors = {};
		assessmentError = null;
		assessmentEditing = true;
	}
	function cancelAssessment() {
		assessmentEditing = false;
		assessmentError = null;
		assessmentFieldErrors = {};
	}

	function validateAssessment(): boolean {
		const errs: Record<string, string> = {};
		if (!scheduleLater) {
			if (!startDate) errs.startDate = 'Pick a start date';
			else if (!anytime) {
				if (!startTime) errs.startDate = 'Pick a start time';
				else if (!endTime) errs.endTime = 'Pick an end time';
				else {
					const s = new Date(`${startDate}T${startTime}`);
					const e = new Date(`${endDate || startDate}T${endTime}`);
					if (e.getTime() <= s.getTime()) errs.endTime = 'End must be after start';
				}
			}
		}
		assessmentFieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	function assessmentSchedulePayload() {
		return {
			all_day: anytime,
			scheduled_start: scheduleLater
				? null
				: anytime
					? new Date(`${startDate}T00:00:00`).toISOString()
					: new Date(`${startDate}T${startTime}`).toISOString(),
			scheduled_end:
				scheduleLater || anytime
					? null
					: new Date(`${endDate || startDate}T${endTime}`).toISOString(),
			notes: instructions.trim() || null,
			assignee_ids: crewIds,
			lead_member_id: leadId
		};
	}

	async function saveAssessment() {
		if (!req) return;
		if (!validateAssessment()) {
			toast.error('Fix the highlighted fields');
			return;
		}
		assessmentSaving = true;
		assessmentError = null;
		try {
			const a = req.assessment;
			let res: Response;
			if (a) {
				res = await fetch(`/api/appointments/${a.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ title: req.title, ...assessmentSchedulePayload() })
				});
			} else {
				res = await fetch('/api/appointments', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						contact_id: req.contact.id,
						request_id: req.id,
						type: 'estimate',
						title: req.title,
						...assessmentSchedulePayload()
					})
				});
			}
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				assessmentError = body.error ?? 'Could not save the assessment.';
				toast.error(assessmentError!);
				return;
			}
			await reloadDetail();
			toast.success('Assessment saved');
			assessmentEditing = false;
		} catch {
			assessmentError = 'Network error. Try again.';
			toast.error(assessmentError);
		} finally {
			assessmentSaving = false;
		}
	}

	async function deleteAssessment() {
		if (!req?.assessment) return;
		assessmentSaving = true;
		try {
			const res = await fetch(`/api/appointments/${req.assessment.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Could not remove the assessment.');
				return;
			}
			await reloadDetail();
			toast.success('Assessment removed');
			assessmentEditing = false;
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			assessmentSaving = false;
		}
	}

	// The appointment endpoints return appointment shape, not the request; the request's
	// derived status depends on the assessment, so re-read the whole detail after any change.
	async function reloadDetail() {
		await requestDetailStore.load(id, true);
		const fresh = requestDetailStore.get(id);
		if (fresh) applyDetail(fresh);
	}

	// ── Complete assessment → convert popup ──────────────────────────────────────
	let completing = $state(false);
	let convertOpen = $state(false);

	async function completeAssessment() {
		if (!req?.assessment || completing) return;
		completing = true;
		try {
			const res = await fetch(`/api/appointments/${req.assessment.id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'completed' })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Could not complete the assessment.');
				return;
			}
			await reloadDetail();
			convertOpen = true;
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			completing = false;
		}
	}

	// ── Header actions: accept / decline / archive / unarchive ───────────────────
	let actionLoading = $state(false);
	let declineOpen = $state(false);

	async function runAction(path: string): Promise<boolean> {
		if (actionLoading) return false;
		actionLoading = true;
		try {
			const res = await fetch(`/api/requests/${id}/${path}`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? 'Something went wrong.');
				return false;
			}
			applyDetail(body.data as RequestDetail);
			return true;
		} catch {
			toast.error('Network error. Try again.');
			return false;
		} finally {
			actionLoading = false;
		}
	}

	async function acceptAndSchedule() {
		const ok = await runAction('accept');
		if (ok) {
			toast.success('Request accepted');
			// Jobber's "Accept and Schedule" opens the schedule UI next.
			startAssessmentEdit();
		}
	}

	// ── Convert to quote / job ───────────────────────────────────────────────────
	// Snapshot-copies the request's line items into a new draft quote/job, freezes the
	// request as Converted (terminal), then lands the contractor on the new record to
	// finish pricing/scheduling (Jobber's flow).
	let converting = $state<'quote' | 'job' | null>(null);

	async function convert(kind: 'quote' | 'job') {
		if (converting) return;
		converting = kind;
		try {
			const res = await fetch(`/api/requests/${id}/convert-to-${kind}`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? `Could not convert to ${kind}.`);
				return;
			}
			// Write-through so the request's frozen "Converted" state is reflected everywhere
			// before we leave the page.
			if (body.data?.request) applyDetail(body.data.request as RequestDetail);
			toast.success(kind === 'quote' ? 'Quote created' : 'Job created');
			await goto(kind === 'quote' ? `/quotes/${body.data.id}` : `/jobs/${body.data.id}`);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			converting = null;
		}
	}

	const rowActions = $derived.by<RowAction[]>(() => {
		if (!req) return [];
		const acts: RowAction[] = [];
		if (isArchived) {
			acts.push({
				key: 'unarchive',
				label: 'Unarchive',
				icon: 'ri-inbox-unarchive-line',
				onSelect: () => void runAction('unarchive').then((ok) => ok && toast.success('Unarchived'))
			});
		} else if (!isConverted) {
			acts.push({
				key: 'archive',
				label: 'Archive',
				icon: 'ri-archive-line',
				onSelect: () => void runAction('archive').then((ok) => ok && toast.success('Archived'))
			});
		}
		acts.push({
			key: 'delete',
			label: 'Delete request',
			icon: 'ri-delete-bin-line',
			destructive: true,
			onSelect: () => (deleteOpen = true)
		});
		return acts;
	});

	// ── Delete ───────────────────────────────────────────────────────────────────
	let deleteOpen = $state(false);
	let deleting = $state(false);
	async function confirmDelete() {
		deleting = true;
		try {
			const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
			if (!res.ok && res.status !== 204) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Could not delete.');
				return;
			}
			requestsStore.remove(id);
			requestDetailStore.remove(id);
			requestStatsStore.invalidate();
			toast.success('Request deleted');
			void goto('/requests');
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			deleting = false;
		}
	}

	// Only one editor open at a time (mirrors the jobs detail page).
	const blockEditing = $derived(overviewEditing || pricingEditing || assessmentEditing);
	const anyEditing = $derived(blockEditing || editCtl.editing);

	const canCompleteAssessment = $derived(
		canManage &&
			!isConverted &&
			!!req?.assessment &&
			(req.assessment.status === 'scheduled' || req.assessment.status === 'unscheduled')
	);

	// Money action (Model-1: pinned top-right). Available on any active request that
	// hasn't converted/archived yet — Jobber lets you create a quote/job from a request
	// at any point, not only right after the assessment completes.
	const canConvert = $derived(canManage && !isConverted && !isArchived && !needsApproval);

	// Deep-link from the calendar's "Find a time" (?schedule=1): auto-open the
	// assessment editor once the request is loaded and editable.
	let scheduleParamHandled = false;
	$effect(() => {
		if (scheduleParamHandled) return;
		if (!req || !canInlineEdit || blockEditing) return;
		if (page.url.searchParams.get('schedule') !== '1') return;
		scheduleParamHandled = true;
		startAssessmentEdit();
	});

	beforeNavigate(({ cancel }) => {
		if (blockEditing && !overviewSaving && !pricingSaving && !assessmentSaving) {
			if (!confirm('You have unsaved changes. Leave anyway?')) cancel();
		}
	});
</script>

<svelte:head><title>{headerVM?.title ?? 'Request'}</title></svelte:head>

<PageWrapper back="/requests">
	{#if loadingCold}
		<SkeletonLoader lines={6} height="92px" label="Loading request" />
	{:else if errorMsg && !req}
		<EmptyState title="Couldn't load request" description={errorMsg} />
	{:else if headerVM && req}
		{@const r = req}

		<!-- ── Header band ─────────────────────────────────────────────────── -->
		<div class="req-detail__header">
			<div class="req-detail__header-top">
				<div class="req-detail__header-lead">
					<span class="req-detail__eyebrow-icon"><i class="ri-inbox-archive-line"></i></span>
					<RequestStatusBadge status={r.status} />
				</div>
				<div class="req-detail__header-actions">
					<RowActionsMenu actions={rowActions} label="Request actions" />
					{#if needsApproval}
						<Button
							variant="danger-outline"
							loading={actionLoading}
							loadingLabel="Working…"
							onclick={() => (declineOpen = true)}
						>
							Decline
						</Button>
						<Button loading={actionLoading} loadingLabel="Working…" onclick={acceptAndSchedule}>
							Accept and Schedule
						</Button>
					{:else if isConverted && (r.converted_to_quote_id || r.converted_to_job_id)}
						<a
							class="req-detail__converted-link"
							href={r.converted_to_quote_id
								? `/quotes/${r.converted_to_quote_id}`
								: `/jobs/${r.converted_to_job_id}`}
						>
							<i class={r.converted_to_quote_id ? 'ri-price-tag-3-line' : 'ri-hammer-line'}></i>
							View {r.converted_to_quote_id ? 'quote' : 'job'}
						</a>
					{:else if canConvert}
						<Button variant="secondary" onclick={() => (convertOpen = true)}>Convert</Button>
					{/if}
				</div>
			</div>

			{#if editCtl.isEditing('title')}
				<div class="req-detail__title-edit">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="field__input req-detail__title-input"
						bind:value={titleDraft}
						onkeydown={onTitleKeydown}
						placeholder="Request title"
						autofocus
					/>
					<EditActionBar
						onSave={() => void editCtl.commit()}
						onCancel={() => editCtl.cancel()}
						saving={editCtl.saving}
						error={editCtl.error}
					/>
				</div>
			{:else}
				<div class="req-detail__title-row">
					<h1 class="req-detail__title">{r.title}</h1>
					{#if canInlineEdit}
						<EditPencil onclick={enterTitleEdit} ariaLabel="Edit request title" />
					{/if}
				</div>
			{/if}

			<div class="req-detail__header-meta">
				<div class="req-detail__client-card">
					<p class="req-detail__client-name">{r.contact.full_name}</p>
					{#if r.contact.company_name}
						<p class="req-detail__client-line">{r.contact.company_name}</p>
					{/if}
					{#if r.contact.phone}<p class="req-detail__client-line">{r.contact.phone}</p>{/if}
					{#if r.contact.email}
						<a class="req-detail__client-email" href="mailto:{r.contact.email}">{r.contact.email}</a>
					{/if}
					<a class="req-detail__client-open" href="/contacts/{r.contact.id}">View client →</a>
				</div>
				<dl class="req-detail__dates">
					<div class="req-detail__date">
						<dt>Requested</dt>
						<dd>{fmtDate(r.requested_at)}</dd>
					</div>
					<div class="req-detail__date">
						<dt>Assessment</dt>
						<dd>{fmtDateTime(r.assessment)}</dd>
					</div>
				</dl>
			</div>
		</div>

		<div class="req-detail__body">
			<!-- ── LEFT COLUMN ──────────────────────────────────────────────── -->
			<div class="req-detail__main">
				<!-- Overview -->
				<section class="req-card">
					<div class="req-card__head">
						<h2 class="req-card__title">Overview</h2>
						{#if canInlineEdit && !overviewEditing && !anyEditing}
							<EditPencil onclick={startOverviewEdit} ariaLabel="Edit overview" />
						{/if}
					</div>

					{#if overviewEditing}
						<div class="req-card__field">
							<span class="req-card__label">Service details</span>
							<textarea class="field__input req-detail__area" rows="4" bind:value={serviceDraft}
							></textarea>
						</div>
						<div class="req-card__field">
							<span class="req-card__label">How did you hear about us?</span>
							<input class="field__input" bind:value={leadSourceDraft} />
						</div>
						<EditActionBar
							onSave={() => void saveOverview()}
							onCancel={cancelOverview}
							saving={overviewSaving}
							error={overviewError}
							saveLabel="Save overview"
							variant="card"
						/>
					{:else}
						<div class="req-card__field">
							<span class="req-card__label">Service details</span>
							{#if r.service_details}
								<p class="req-detail__text">{r.service_details}</p>
							{:else}
								<span class="req-detail__muted">No service details</span>
							{/if}
						</div>

						{#if r.photos.length > 0}
							<div class="req-card__field">
								<span class="req-card__label">Images of the work</span>
								<div class="req-detail__photos">
									{#each r.photos as photo (photo.id)}
										<a
											class="req-detail__photo"
											href={photo.web_url}
											target="_blank"
											rel="noopener"
											title={photo.original_filename}
										>
											<img src={photo.thumbnail_url} alt={photo.original_filename} loading="lazy" />
										</a>
									{/each}
								</div>
							</div>
						{/if}

						<div class="req-card__field">
							<span class="req-card__label">How did you hear about us?</span>
							{#if r.lead_source_answer}
								<p class="req-detail__text">{r.lead_source_answer}</p>
							{:else}
								<span class="req-detail__muted">—</span>
							{/if}
						</div>

						{#each r.custom_answers as ans (ans.id)}
							<div class="req-card__field">
								<span class="req-card__label">{ans.question_label}</span>
								{#if ans.value_json && ans.value_json.length > 0}
									<p class="req-detail__text">{ans.value_json.join(', ')}</p>
								{:else if ans.value_text}
									<p class="req-detail__text">{ans.value_text}</p>
								{:else}
									<span class="req-detail__muted">—</span>
								{/if}
							</div>
						{/each}
					{/if}
				</section>

				<!-- On-site assessment -->
				<section class="req-card">
					<div class="req-card__head">
						<h2 class="req-card__title">On-site assessment</h2>
						{#if canInlineEdit && !assessmentEditing && !anyEditing && r.assessment}
							<EditPencil onclick={startAssessmentEdit} ariaLabel="Edit assessment" />
						{/if}
					</div>

					{#if assessmentEditing}
						<RequestAssessmentEditor
							bind:instructions
							bind:startDate
							bind:endDate
							bind:startTime
							bind:endTime
							bind:scheduleLater
							bind:anytime
							bind:selectedIds={crewIds}
							bind:leadId
							errors={assessmentFieldErrors}
						/>
						<div class="req-detail__assessment-foot">
							{#if r.assessment}
								<Button
									variant="danger-outline"
									loading={assessmentSaving}
									onclick={() => void deleteAssessment()}
								>
									Delete
								</Button>
							{/if}
							<div class="req-detail__assessment-foot-right">
								<EditActionBar
									onSave={() => void saveAssessment()}
									onCancel={cancelAssessment}
									saving={assessmentSaving}
									error={assessmentError}
									saveLabel="Save assessment"
									variant="card"
								/>
							</div>
						</div>
					{:else if r.assessment}
						{@const a = r.assessment}
						{#if a.notes}
							<div class="req-card__field">
								<span class="req-card__label">Instructions</span>
								<p class="req-detail__text">{a.notes}</p>
							</div>
						{/if}
						<div class="req-detail__assessment-grid">
							<div class="req-card__field">
								<span class="req-card__label">Schedule</span>
								<p class="req-detail__text">{fmtDateTime(a)}</p>
								{#if canCompleteAssessment}
									<label class="req-detail__complete">
										<input
											type="checkbox"
											checked={a.status === 'completed'}
											disabled={completing}
											onchange={() => void completeAssessment()}
										/>
										<span>Complete assessment</span>
									</label>
								{:else if a.status === 'completed'}
									<span class="req-detail__done"><i class="ri-check-line"></i> Completed</span>
								{/if}
							</div>
							<div class="req-card__field">
								<span class="req-card__label">Team</span>
								{#if a.assignee_ids.length > 0}
									<ul class="req-detail__team">
										{#each a.assignee_ids as mid (mid)}
											<li>{assigneeNames[mid] ?? 'Team member'}</li>
										{/each}
									</ul>
								{:else}
									<span class="req-detail__muted">Unassigned</span>
								{/if}
							</div>
						</div>
					{:else}
						<button
							type="button"
							class="req-detail__placeholder"
							disabled={!canInlineEdit}
							onclick={startAssessmentEdit}
						>
							<span class="req-detail__placeholder-icon"><i class="ri-truck-line"></i></span>
							<span>Visit the property to assess the job before you do the work</span>
						</button>
					{/if}
				</section>

				<!-- Product / Service -->
				<section class="req-card">
					<div class="req-card__head">
						<h2 class="req-card__title">Product / Service</h2>
						{#if canInlineEdit && !pricingEditing && !anyEditing}
							<EditPencil onclick={startPricingEdit} ariaLabel="Edit products and services" />
						{/if}
					</div>

					{#if pricingEditing}
						<div class="req-detail__line-actions">
							<Button type="button" onclick={() => lineControls?.addItem()}>
								<i class="ri-add-line" aria-hidden="true"></i> Add line item
							</Button>
							<Button type="button" variant="secondary" onclick={() => (catalogOpen = true)}>
								<i class="ri-book-2-line" aria-hidden="true"></i> Add from price book
							</Button>
						</div>
						<LineItemEditor
							bind:lineItems
							enableCatalog
							hoistActions
							bind:catalogOpen
							bind:controls={lineControls}
						/>
						<div class="req-detail__totals">
							<div class="req-detail__totals-row req-detail__totals-row--total">
								<span>Total</span>
								<span>{formatCurrency(editSubtotal)}</span>
							</div>
						</div>
						<EditActionBar
							onSave={() => void savePricing()}
							onCancel={cancelPricing}
							saving={pricingSaving}
							error={pricingError}
							saveLabel="Save products"
							variant="card"
						/>
					{:else if r.line_items.length > 0}
						<table class="req-detail__items">
							<thead>
								<tr>
									<th>Item</th>
									<th class="req-detail__num">Qty</th>
									<th class="req-detail__num">Unit price</th>
									<th class="req-detail__num">Total</th>
								</tr>
							</thead>
							<tbody>
								{#each r.line_items as li (li.id)}
									<tr>
										<td>
											<span class="req-detail__item-name">{li.description}</span>
											{#if li.details}<span class="req-detail__item-details">{li.details}</span>{/if}
										</td>
										<td class="req-detail__num">{li.quantity}</td>
										<td class="req-detail__num">{formatCurrency(Number(li.unit_price))}</td>
										<td class="req-detail__num">{formatCurrency(Number(li.total))}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						<div class="req-detail__totals">
							<div class="req-detail__totals-row req-detail__totals-row--total">
								<span>Total</span>
								<span>{formatCurrency(Number(r.total))}</span>
							</div>
						</div>
					{:else}
						<p class="req-detail__muted">
							Keep everything on track by adding products and services.
						</p>
						{#if canInlineEdit}
							<div>
								<Button type="button" onclick={startPricingEdit}>
									<i class="ri-add-line" aria-hidden="true"></i> Add line item
								</Button>
							</div>
						{/if}
					{/if}
				</section>

				<!-- Labor (Jobber renders a placeholder here; real labor is tracked on the Job
				     after conversion) -->
				<section class="req-card">
					<h2 class="req-card__title">Labor</h2>
					<div class="req-detail__labor">
						<i class="ri-time-line" aria-hidden="true"></i>
						<span>Time tracked to this request will show here</span>
					</div>
				</section>
			</div>

			<!-- ── RIGHT RAIL ───────────────────────────────────────────────── -->
			<div class="req-detail__rail">
				<!-- Notes -->
				<section class="req-card">
					<div class="req-card__head">
						<h2 class="req-card__title">Notes</h2>
					</div>
					<InlineEditRow
						label="Internal note"
						canEdit={canInlineEdit}
						{...rowCtl(
							'notes',
							() => (notesDraft = r.notes ?? ''),
							() => patchRequestField({ notes: notesDraft.trim() || null })
						)}
					>
						{#snippet display()}
							{#if r.notes}
								<p class="req-detail__text">{r.notes}</p>
							{:else}
								<span class="req-detail__muted">Add an internal note</span>
							{/if}
						{/snippet}
						{#snippet editor()}
							<!-- svelte-ignore a11y_autofocus -->
							<textarea
								class="field__input req-detail__area"
								rows="4"
								bind:value={notesDraft}
								placeholder="Note visible only to your team"
								autofocus
							></textarea>
						{/snippet}
					</InlineEditRow>

					{#if r.photos.length > 0}
						<div class="req-card__field">
							<span class="req-card__label">Attachments from client</span>
							<div class="req-detail__photos">
								{#each r.photos as photo (photo.id)}
									<a
										class="req-detail__photo req-detail__photo--sm"
										href={photo.web_url}
										target="_blank"
										rel="noopener"
										title={photo.original_filename}
									>
										<img src={photo.thumbnail_url} alt={photo.original_filename} loading="lazy" />
									</a>
								{/each}
							</div>
						</div>
					{/if}
				</section>
			</div>
		</div>

		<RequestConvertDialog
			bind:open={convertOpen}
			convertSoon={false}
			converting={converting}
			onConvertQuote={() => convert('quote')}
			onConvertJob={() => convert('job')}
			onArchive={() => void runAction('archive').then((ok) => ok && toast.success('Archived'))}
			onLeave={() => {}}
		/>

		<ConfirmDialog
			bind:open={declineOpen}
			title="Decline this request?"
			description="The request is closed and any held assessment slot is released. You can unarchive it later."
			confirmLabel="Decline"
			variant="destructive"
			loading={actionLoading}
			onConfirm={async () => {
				const ok = await runAction('decline');
				if (ok) toast.success('Request declined');
			}}
		/>

		<ConfirmDialog
			bind:open={deleteOpen}
			title="Delete this request?"
			description="This removes the request and its assessment. This cannot be undone."
			confirmLabel="Delete"
			variant="destructive"
			loading={deleting}
			onConfirm={confirmDelete}
		/>
	{:else}
		<EmptyState title="Couldn't load request" description={errorMsg ?? 'Unknown error.'} />
	{/if}
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.req-detail__header {
		background: var(--color-bg-surface-sunk);
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		padding: $space-5;
		display: flex;
		flex-direction: column;
		gap: $space-4;
		margin-bottom: $space-4;
	}

	.req-detail__header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
	}

	.req-detail__header-lead {
		display: flex;
		align-items: center;
		gap: $space-3;
	}

	.req-detail__eyebrow-icon {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: $radius-md;
		background: var(--color-bg-surface);
		color: var(--color-brand);
		font-size: 1.6rem;
	}

	.req-detail__header-actions {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.req-detail__converted-link {
		display: inline-flex;
		align-items: center;
		gap: $space-1;
		padding: $space-2 $space-3;
		border: 1px solid var(--color-border);
		border-radius: $radius-full;
		font-size: $fs-body;
		font-weight: $weight-medium;
		color: var(--color-text-primary);
		text-decoration: none;

		&:hover {
			background: var(--color-bg-surface-sunk);
		}
	}

	.req-detail__title-row {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.req-detail__title {
		margin: 0;
		font-size: $fs-h2;
		font-weight: $weight-bold;
		color: var(--color-text-primary);
	}

	.req-detail__title-edit {
		display: flex;
		flex-direction: column;
		gap: $space-2;
	}

	.req-detail__title-input {
		font-size: $fs-lg;
		font-weight: $weight-semibold;
	}

	.req-detail__header-meta {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: $space-4;

		@media (min-width: $bp-tablet) {
			grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
		}
	}

	.req-detail__client-card {
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
		padding: $space-4;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.req-detail__client-name {
		margin: 0;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	.req-detail__client-line {
		margin: 0;
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}

	.req-detail__client-email {
		font-size: $fs-body;
		color: var(--color-brand);
	}

	.req-detail__client-open {
		margin-top: $space-2;
		font-size: $fs-caption;
		font-weight: $weight-medium;
		color: var(--color-brand);
	}

	.req-detail__dates {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: $space-3;
	}

	.req-detail__date {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: $space-3;

		dt {
			color: var(--color-text-secondary);
			font-size: $fs-body;
		}
		dd {
			margin: 0;
			color: var(--color-text-primary);
			font-weight: $weight-medium;
		}
	}

	.req-detail__body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: $space-4;

		@media (min-width: $bp-tablet) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
		}
	}

	.req-detail__main,
	.req-detail__rail {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		min-width: 0;
	}

	.req-card {
		background: var(--color-bg-surface);
		border: 1px solid var(--color-border);
		border-radius: $radius-lg;
		box-shadow: var(--shadow-sm);
		padding: $space-5;
		display: flex;
		flex-direction: column;
		gap: $space-4;

		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: $space-2;
		}

		&__title {
			margin: 0;
			font-size: $fs-lg;
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
		}

		&__field {
			display: flex;
			flex-direction: column;
			gap: $space-2;
			min-width: 0;
		}

		&__label {
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			color: var(--color-text-secondary);
		}
	}

	.req-detail__text {
		margin: 0;
		white-space: pre-wrap;
		font-size: $fs-body;
		color: var(--color-text-primary);
	}

	.req-detail__muted {
		font-size: $fs-body;
		color: var(--color-text-muted);
	}

	.req-detail__area {
		width: 100%;
		resize: vertical;
	}

	.req-detail__photos {
		display: flex;
		flex-wrap: wrap;
		gap: $space-2;
	}

	.req-detail__photo {
		width: 88px;
		height: 88px;
		border-radius: $radius-md;
		overflow: hidden;
		border: 1px solid var(--color-border);
		display: block;

		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}

		&--sm {
			width: 60px;
			height: 60px;
		}
	}

	.req-detail__assessment-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: $space-4;

		@media (min-width: $bp-tablet) {
			grid-template-columns: 1fr 1fr;
		}
	}

	.req-detail__complete {
		display: flex;
		align-items: center;
		gap: $space-2;
		margin-top: $space-2;
		font-size: $fs-body;
		color: var(--color-text-primary);
		cursor: pointer;
	}

	.req-detail__done {
		display: inline-flex;
		align-items: center;
		gap: $space-1;
		margin-top: $space-2;
		font-size: $fs-body;
		color: var(--color-success, #1f9d55);
	}

	.req-detail__team {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: $space-1;
		font-size: $fs-body;
		color: var(--color-text-primary);
	}

	.req-detail__assessment-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
		flex-wrap: wrap;
	}

	.req-detail__assessment-foot-right {
		margin-left: auto;
	}

	.req-detail__placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: $space-3;
		width: 100%;
		padding: $space-8 $space-4;
		border: 1px dashed var(--color-border-strong);
		border-radius: $radius-md;
		background: none;
		color: var(--color-text-secondary);
		font-size: $fs-body;
		cursor: pointer;

		&:hover:not(:disabled) {
			border-color: var(--color-brand);
			color: var(--color-text-primary);
		}
		&:disabled {
			cursor: default;
			opacity: 0.7;
		}
	}

	.req-detail__placeholder-icon {
		width: 48px;
		height: 48px;
		border-radius: $radius-full;
		background: var(--color-bg-surface-sunk);
		display: grid;
		place-items: center;
		font-size: 2rem;
	}

	.req-detail__line-actions {
		display: flex;
		gap: $space-2;
		flex-wrap: wrap;
	}

	.req-detail__items {
		width: 100%;
		border-collapse: collapse;
		font-size: $fs-body;

		th,
		td {
			padding: $space-2 $space-3;
			text-align: left;
			border-bottom: 1px solid var(--color-border);
			vertical-align: top;
		}

		th {
			font-size: $fs-caption;
			font-weight: $weight-semibold;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			color: var(--color-text-secondary);
		}
	}

	.req-detail__num {
		text-align: right;
		white-space: nowrap;
	}

	.req-detail__item-name {
		display: block;
		color: var(--color-text-primary);
	}

	.req-detail__item-details {
		display: block;
		font-size: $fs-caption;
		color: var(--color-text-secondary);
	}

	.req-detail__totals {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.req-detail__totals-row {
		display: flex;
		justify-content: space-between;
		gap: $space-8;
		min-width: 220px;

		&--total {
			font-weight: $weight-semibold;
			color: var(--color-text-primary);
			padding-top: $space-2;
			border-top: 1px solid var(--color-border);
		}
	}

	.req-detail__labor {
		display: flex;
		align-items: center;
		gap: $space-3;
		padding: $space-3 0;
		color: var(--color-text-muted);
		font-size: $fs-body;

		i {
			font-size: 1.8rem;
		}
	}
</style>
