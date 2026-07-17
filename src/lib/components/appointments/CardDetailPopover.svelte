<script lang="ts">
	import DraggablePanel from '$lib/components/shared/DraggablePanel.svelte';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { formatCurrencyExact } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast.svelte';
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

	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

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
	// Details = the job page when this visit came from a job (Jobber's "Details" opens
	// the job); a standalone visit has no job, so it opens the visit itself.
	const detailsHref = $derived(
		item ? (item.job_id ? `/jobs/${item.job_id}` : `/appointments/${item.id}`) : '#'
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
	let statusSaving = $state<AppointmentStatus | null>(null);
	let showMore = $state(false);

	async function setStatus(next: 'completed' | 'cancelled' | 'no_show') {
		if (!item || statusSaving) return;
		statusSaving = next;
		try {
			const res = await fetch(`/api/appointments/${item.id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Could not update status.');
				return;
			}
			onStatusChange?.(item.id, next);
			toast.success(
				next === 'completed'
					? 'Marked completed.'
					: next === 'cancelled'
						? 'Visit cancelled.'
						: 'Marked no-show.'
			);
			showMore = false;
		} catch {
			toast.error('Could not update status.');
		} finally {
			statusSaving = null;
		}
	}
</script>

<DraggablePanel {anchorEl} ariaLabel="Appointment details" {onClose}>
	{#snippet heading()}
		{#if item}
			<span
				class={[
					'card-detail-pop__type',
					`card-detail-pop__type--${item.type}`,
					isTerminal && `card-detail-pop__type--${item.status}`
				]}
			>
				{TYPE_LABELS[item.type]}
			</span>
		{/if}
	{/snippet}

	<div class="card-detail-pop card-detail-pop--panel">
		{#if item}
			<h3 class="card-detail-pop__title">{item.title}</h3>

			<!-- Quick complete (Jobber's "Completed" checkbox) / terminal status badge -->
			{#if item.status === 'completed'}
				<div class="card-detail-pop__done card-detail-pop__done--on">
					<i class="ri-checkbox-circle-fill" aria-hidden="true"></i>
					<span>Completed</span>
				</div>
			{:else if item.status === 'cancelled' || item.status === 'no_show'}
				<div class="card-detail-pop__done card-detail-pop__done--muted">
					<i class="ri-close-circle-line" aria-hidden="true"></i>
					<span>{STATUS_LABELS[item.status]}</span>
				</div>
			{:else if canEdit}
				<button
					type="button"
					class="card-detail-pop__done card-detail-pop__done--action"
					disabled={statusSaving != null}
					onclick={() => setStatus('completed')}
				>
					{#if statusSaving === 'completed'}
						<i class="ri-loader-4-line card-detail-pop__spin" aria-hidden="true"></i>
					{:else}
						<i class="ri-checkbox-blank-circle-line" aria-hidden="true"></i>
					{/if}
					<span>Mark completed</span>
				</button>
			{/if}

			<!-- Customer + job -->
			<dl class="card-detail-pop__facts">
				<div class="card-detail-pop__fact">
					<dt>Customer</dt>
					<dd>
						<a class="card-detail-pop__link" href={`/contacts/${item.contact_id}`}>
							{item.contact_name}
						</a>
					</dd>
				</div>
				{#if item.job_id}
					<div class="card-detail-pop__fact">
						<dt>Job</dt>
						<dd>
							<a class="card-detail-pop__link" href={`/jobs/${item.job_id}`}>View job</a>
						</dd>
					</div>
				{/if}
			</dl>

			<!-- Team -->
			<div class="card-detail-pop__team">
				<span class="card-detail-pop__team-label">Team</span>
				{#if item.assignee_name}
					<span class="card-detail-pop__crew">
						<span class="card-detail-pop__avatar">{initials(item.assignee_name)}</span>
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
				<p class="card-detail-pop__loc">
					<i class="ri-map-pin-2-line" aria-hidden="true"></i>
					<span>{item.location}</span>
				</p>
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
				{#if item.job_id}
					<a class="card-detail-pop__btn" href={`/appointments/${item.id}`}>Edit</a>
				{/if}
				<a class="card-detail-pop__btn card-detail-pop__btn--primary" href={detailsHref}>
					Details
				</a>
			</footer>
		{/if}
	</div>
</DraggablePanel>
