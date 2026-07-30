<script lang="ts">
	import { goto } from '$app/navigation';
	import DraggablePanel from '$lib/components/shared/DraggablePanel.svelte';
	import RequestConvertDialog from '$lib/components/requests/RequestConvertDialog.svelte';
	import VisitCompleteActionsDialog from '$lib/components/jobs/VisitCompleteActionsDialog.svelte';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { formatCurrencyExact } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
	import Avatar from '$lib/components/shared/Avatar.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { shouldPromptVisitComplete } from '$lib/jobs/visitCompletePrompt';
	import type { AppointmentStatusJobEcho } from '$lib/types/jobs';
	import type {
		AppointmentListItem,
		AppointmentStatus,
		AppointmentType
	} from '$lib/types/appointments';

	let {
		item,
		anchorEl,
		orgTz,
		canEdit = false,
		onStatusChange,
		onClose
	}: {
		item: AppointmentListItem | null;
		anchorEl: HTMLElement | null;
		orgTz: string | undefined;
		// can_reschedule_appointments — gates the completed / cancel / no-show actions.
		canEdit?: boolean;
		// Fired after a successful status change so the parent can restyle the card.
		onStatusChange?: (id: string, status: AppointmentStatus) => void;
		onClose: () => void;
	} = $props();

	const member = getMemberContext();

	const TYPE_LABELS: Record<AppointmentType, string> = {
		estimate: 'Estimate',
		job_start: 'Job',
		follow_up: 'Follow-up',
		inspection: 'Inspection',
		other: 'Visit'
	};

	const STATUS_LABELS: Record<AppointmentStatus, string> = {
		scheduled: 'Scheduled',
		unscheduled: 'Unscheduled',
		completed: 'Completed',
		cancelled: 'Cancelled',
		no_show: 'No-show'
	};

	function formatDateInOrgTz(iso: string): string {
		try {
			return new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: orgTz || undefined
			}).format(new Date(iso));
		} catch {
			return new Date(iso).toLocaleDateString();
		}
	}

	const isTerminal = $derived(
		item != null &&
			(item.status === 'completed' || item.status === 'cancelled' || item.status === 'no_show')
	);
	// A request-linked estimate is an on-site Assessment (Jobber identity).
	const isAssessment = $derived(!!item?.request_id);
	// Details = the request page for an assessment (Jobber opens the request), the job
	// page when this visit came from a job, else the standalone visit itself.
	const detailsHref = $derived(
		!item
			? '#'
			: item.request_id
				? `/requests/${item.request_id}`
				: item.job_id
					? `/jobs/${item.job_id}`
					: `/appointments/${item.id}`
	);

	// "Find a time" (Jobber ref/visit/3) — shown only when the visit has no date yet.
	// Routes to the scheduling surface: an assessment schedules on its request page
	// (?schedule=1 auto-opens the editor), any other visit on its own edit page.
	const isUnscheduled = $derived(item?.status === 'unscheduled');
	const scheduleHref = $derived(
		!item
			? '#'
			: item.request_id
				? `/requests/${item.request_id}?schedule=1`
				: `/appointments/${item.id}`
	);

	// ---- Line items (lazy, only for job-linked visits) --------------------------
	type LineItem = { line_key: string; description: string; quantity: string; unit: string | null };
	type LineData = { has_job: boolean; total: string | null; line_items: LineItemRow[] };
	type LineItemRow = LineItem & { total: string };
	let lineStatus = $state<'idle' | 'loading' | 'done' | 'error'>('idle');
	let lineData = $state<LineData | null>(null);
	let lineToken = 0;

	async function loadLineItems(id: string) {
		const token = ++lineToken;
		lineStatus = 'loading';
		lineData = null;
		try {
			const res = await fetch(`/api/appointments/${id}/line-items`);
			if (token !== lineToken) return; // a newer card superseded this fetch
			if (!res.ok) {
				lineStatus = 'error';
				return;
			}
			const body = (await res.json()) as { data: LineData };
			if (token !== lineToken) return;
			lineData = body.data;
			lineStatus = 'done';
		} catch {
			if (token !== lineToken) return;
			lineStatus = 'error';
		}
	}

	// Fetch whenever a card is shown (component is only mounted while one is open).
	$effect(() => {
		if (item) {
			loadLineItems(item.id);
		} else {
			lineToken++; // cancel any in-flight fetch
			lineStatus = 'idle';
			lineData = null;
		}
	});

	// ---- Status actions ---------------------------------------------------------
	let statusSaving = $state<AppointmentStatus | 'incomplete' | null>(null);
	// Jobber's post-completion prompt (Invoice now/later + Close/Leave-open) after marking done.
	let visitPromptOpen = $state(false);
	let completionEcho = $state<AppointmentStatusJobEcho>(null);
	let showMore = $state(false);

	// "Assessment completed" prompt (Jobber ref/visit/4) — opens the moment an
	// assessment is marked complete. Reuses the shared RequestConvertDialog wired to
	// the same live endpoints as the request detail page.
	let convertOpen = $state(false);
	let converting = $state<'quote' | 'job' | null>(null);

	async function convert(kind: 'quote' | 'job') {
		if (!item?.request_id || converting) return;
		converting = kind;
		try {
			const res = await fetch(`/api/requests/${item.request_id}/convert-to-${kind}`, {
				method: 'POST'
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body.error ?? `Could not convert to ${kind}.`);
				return;
			}
			toast.success(kind === 'quote' ? 'Quote created' : 'Job created');
			// Navigate straight to the new record. Don't tear down the popover first —
			// unmounting mid-flight cancels the navigation (the route change tears it
			// down for us). Matches the request detail page's convert().
			await goto(kind === 'quote' ? `/quotes/${body.data.id}` : `/jobs/${body.data.id}`);
		} catch {
			toast.error('Network error. Try again.');
		} finally {
			converting = null;
		}
	}

	async function archiveRequest() {
		if (!item?.request_id) return;
		try {
			const res = await fetch(`/api/requests/${item.request_id}/archive`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.error ?? 'Could not archive.');
				return;
			}
			toast.success('Archived');
			convertOpen = false;
			onClose();
		} catch {
			toast.error('Network error. Try again.');
		}
	}

	async function setStatus(next: 'completed' | 'cancelled' | 'no_show' | 'incomplete') {
		if (!item || statusSaving) return;
		statusSaving = next;
		try {
			const res = await fetch(`/api/appointments/${item.id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			const body = (await res.json().catch(() => ({}))) as {
				error?: string;
				data?: { job?: AppointmentStatusJobEcho };
			};
			if (!res.ok) {
				toast.error(body.error ?? 'Could not update status.');
				return;
			}
			// 'incomplete' reopens the visit — the server sends it back to scheduled (has a
			// date) or unscheduled (no date). Echo the resolved live status to the parent.
			const resolved: AppointmentStatus =
				next === 'incomplete' ? (item.scheduled_start ? 'scheduled' : 'unscheduled') : next;
			onStatusChange?.(item.id, resolved);
			toast.success(
				next === 'completed'
					? 'Marked completed.'
					: next === 'incomplete'
						? 'Reopened.'
						: next === 'cancelled'
							? 'Visit cancelled.'
							: 'Marked no-show.'
			);
			showMore = false;
			// Completing an assessment opens the convert prompt (Jobber ref/visit/4); a job
			// visit instead raises the Invoice-now/later + Close/Leave-open prompt (jobber-04 §3.3).
			if (next === 'completed' && isAssessment) {
				convertOpen = true;
			} else if (next === 'completed' && item.job_id) {
				const echo = body?.data?.job ?? null;
				if (shouldPromptVisitComplete(echo, member())) {
					completionEcho = echo;
					visitPromptOpen = true;
				}
			}
		} catch {
			toast.error('Could not update status.');
		} finally {
			statusSaving = null;
		}
	}
</script>

<DraggablePanel {anchorEl} ariaLabel="Appointment details" {onClose}>
	<div class="card-detail-pop card-detail-pop--panel">
		{#if item}
			<h3 class="card-detail-pop__title">{item.title}</h3>
			<!-- Type as a subtitle under the title (Jobber ref/visit/3). -->
			<p class="card-detail-pop__subtype">
				{isAssessment ? 'Assessment' : TYPE_LABELS[item.type]}
			</p>

			<!-- Completed checkbox (Jobber ref/visit/3): a real toggle — check to complete,
			     uncheck to reopen. Cancelled / no-show stay as a muted status badge. -->
			{#if item.status === 'cancelled' || item.status === 'no_show'}
				<div class="card-detail-pop__done card-detail-pop__done--muted">
					<i class="ri-close-circle-line" aria-hidden="true"></i>
					<span>{STATUS_LABELS[item.status]}</span>
				</div>
			{:else if canEdit}
				{@const done = item.status === 'completed'}
				<button
					type="button"
					class={['card-detail-pop__check', done && 'card-detail-pop__check--on']}
					disabled={statusSaving != null}
					aria-pressed={done}
					onclick={() => setStatus(done ? 'incomplete' : 'completed')}
				>
					{#if statusSaving === 'completed' || statusSaving === 'incomplete'}
						<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
					{:else if done}
						<i class="ri-checkbox-line" aria-hidden="true"></i>
					{:else}
						<i class="ri-checkbox-blank-line" aria-hidden="true"></i>
					{/if}
					<span>Completed</span>
				</button>
			{:else if item.status === 'completed'}
				<div class="card-detail-pop__done card-detail-pop__done--on">
					<i class="ri-checkbox-line" aria-hidden="true"></i>
					<span>Completed</span>
				</div>
			{/if}

			<!-- Details: client · request/job link, then the instructions (Jobber ref/visit/3). -->
			<div class="card-detail-pop__details">
				<span class="card-detail-pop__section-label">Details</span>
				<p class="card-detail-pop__detail-line">
					<a class="card-detail-pop__link" href={`/contacts/${item.contact_id}`}>
						{item.contact_name}
					</a>
					{#if item.request_id}
						<span class="card-detail-pop__dot" aria-hidden="true">·</span>
						<a class="card-detail-pop__link" href={`/requests/${item.request_id}`}>View request</a>
					{:else if item.job_id}
						<span class="card-detail-pop__dot" aria-hidden="true">·</span>
						<a class="card-detail-pop__link" href={`/jobs/${item.job_id}`}>View job</a>
					{/if}
				</p>
				{#if item.notes}
					<p class="card-detail-pop__instructions">{item.notes}</p>
				{/if}
			</div>

			<!-- Team -->
			<div class="card-detail-pop__team">
				<span class="card-detail-pop__team-label">Team</span>
				{#if item.assignee_name}
					<span class="card-detail-pop__crew">
						<Avatar size="sm" name={item.assignee_name} />
						<span>{item.assignee_name}</span>
						{#if item.assignee_count > 1}
							<span class="card-detail-pop__more">+{item.assignee_count - 1}</span>
						{/if}
					</span>
				{:else}
					<span class="card-detail-pop__unassigned">Unassigned</span>
				{/if}
			</div>

			{#if item.location}
				<div class="card-detail-pop__loc-block">
					<span class="card-detail-pop__section-label">Location</span>
					<p class="card-detail-pop__loc">{item.location}</p>
				</div>
			{/if}

			<!-- When -->
			{#if item.all_day}
				<div class="card-detail-pop__when">
					<div class="card-detail-pop__when-col">
						<span class="card-detail-pop__when-label">When</span>
						<span class="card-detail-pop__when-date">{formatDateInOrgTz(item.scheduled_start)}</span
						>
						<span class="card-detail-pop__when-time">Anytime</span>
					</div>
				</div>
			{:else}
				<div class="card-detail-pop__when card-detail-pop__when--range">
					<div class="card-detail-pop__when-col">
						<span class="card-detail-pop__when-label">Start</span>
						<span class="card-detail-pop__when-date">{formatDateInOrgTz(item.scheduled_start)}</span
						>
						<span class="card-detail-pop__when-time"
							>{formatTimeInOrgTz(item.scheduled_start, orgTz)}</span
						>
					</div>
					{#if item.scheduled_end}
						<div class="card-detail-pop__when-col">
							<span class="card-detail-pop__when-label">End</span>
							<span class="card-detail-pop__when-date">{formatDateInOrgTz(item.scheduled_end)}</span
							>
							<span class="card-detail-pop__when-time"
								>{formatTimeInOrgTz(item.scheduled_end, orgTz)}</span
							>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Line items (job-linked visits only) -->
			{#if lineStatus === 'loading'}
				<div class="card-detail-pop__lines card-detail-pop__lines--loading">
					<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
					<span>Loading line items…</span>
				</div>
			{:else if lineStatus === 'done' && lineData?.has_job && lineData.line_items.length > 0}
				<div class="card-detail-pop__lines">
					<span class="card-detail-pop__lines-label">Line items</span>
					{#each lineData.line_items as li (li.line_key)}
						<div class="card-detail-pop__line">
							<span class="card-detail-pop__line-qty">{Number(li.quantity)}×</span>
							<span class="card-detail-pop__line-desc">{li.description}</span>
							<span class="card-detail-pop__line-amt">{formatCurrencyExact(li.total)}</span>
						</div>
					{/each}
					{#if lineData.total != null}
						<div class="card-detail-pop__line card-detail-pop__line--total">
							<span class="card-detail-pop__line-desc">Total</span>
							<span class="card-detail-pop__line-amt">{formatCurrencyExact(lineData.total)}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- More actions (cancel / no-show) revealed inline — no nested portal -->
			{#if showMore && !isTerminal && canEdit}
				<div class="card-detail-pop__more-row">
					<button
						type="button"
						class="card-detail-pop__more-btn card-detail-pop__more-btn--danger"
						disabled={statusSaving != null}
						onclick={() => setStatus('cancelled')}
					>
						{#if statusSaving === 'cancelled'}
							<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
						{:else}
							<i class="ri-close-circle-line" aria-hidden="true"></i>
						{/if}
						<span>Cancel visit</span>
					</button>
					<button
						type="button"
						class="card-detail-pop__more-btn"
						disabled={statusSaving != null}
						onclick={() => setStatus('no_show')}
					>
						{#if statusSaving === 'no_show'}
							<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
						{:else}
							<i class="ri-user-unfollow-line" aria-hidden="true"></i>
						{/if}
						<span>No-show</span>
					</button>
				</div>
			{/if}

			<!-- Footer actions -->
			<footer class="card-detail-pop__foot">
				{#if !isTerminal && canEdit}
					<button
						type="button"
						class="card-detail-pop__icon-btn"
						aria-label="More actions"
						aria-pressed={showMore}
						onclick={() => (showMore = !showMore)}
					>
						<i class="ri-more-2-fill" aria-hidden="true"></i>
					</button>
				{/if}
				<span class="card-detail-pop__foot-spacer"></span>
				{#if isUnscheduled && canEdit}
					<a class="card-detail-pop__btn" href={scheduleHref}>
						<i class="ri-time-line" aria-hidden="true"></i>
						<span>Find a time</span>
					</a>
				{/if}
				{#if item.job_id}
					<a class="card-detail-pop__btn" href={`/appointments/${item.id}`}>Edit</a>
				{/if}
				<a class="card-detail-pop__btn card-detail-pop__btn--primary" href={detailsHref}>
					Details
				</a>
			</footer>

			<!-- Assessment completed prompt (Jobber ref/visit/4) — reused shared dialog. -->
			<RequestConvertDialog
				bind:open={convertOpen}
				convertSoon={false}
				{converting}
				onConvertQuote={() => convert('quote')}
				onConvertJob={() => convert('job')}
				onArchive={archiveRequest}
				onLeave={() => {}}
			/>

			<!-- Job visit completed → Invoice now/later + Close/Leave-open (Jobber jobber-04 §3.3). -->
			{#if item.job_id}
				<VisitCompleteActionsDialog
					bind:open={visitPromptOpen}
					jobId={item.job_id}
					jobTitle={item.title}
					echo={completionEcho}
				/>
			{/if}
		{/if}
	</div>
</DraggablePanel>
