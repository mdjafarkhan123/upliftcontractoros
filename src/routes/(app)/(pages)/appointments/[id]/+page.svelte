<script lang="ts">
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import AppointmentStatusBadge from '$lib/components/appointments/AppointmentStatusBadge.svelte';
	import VisitCompleteActionsDialog from '$lib/components/jobs/VisitCompleteActionsDialog.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { shouldPromptVisitComplete } from '$lib/jobs/visitCompletePrompt';
	import { formatDateTimeInOrgTz, formatInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { AppointmentStatusJobEcho } from '$lib/types/jobs';
	import type { AppointmentDetail, AppointmentStatus } from '$lib/types/appointments';

	let { data }: { data: PageData } = $props();

	const member = getMemberContext();
	const orgTz = $derived(sessionStore.data?.org.timezone);
	const canEdit = $derived(member().can_reschedule_appointments);
	const canEditAssignee = $derived(member().can_view_all_appointments);

	const id = $derived(data.id);

	// SWR load — instant if the row was prefetched on hover or seen before.
	$effect(() => {
		void appointmentsStore.loadDetail(id);
	});

	const appointment = $derived(appointmentsStore.getDetail(id));
	const detailStatus = $derived(appointmentsStore.getDetailStatus(id));
	const detailError = $derived(appointmentsStore.getDetailError(id));
	const showSkeleton = $derived(!appointment && detailStatus !== 'error');

	let editOpen = $state(false);
	let actionLoading = $state(false);
	let completeOpen = $state(false);
	let cancelOpen = $state(false);
	let noShowOpen = $state(false);
	// Jobber's post-completion prompt (Invoice now/later + Close/Leave-open on the last visit).
	let visitPromptOpen = $state(false);
	let completionEcho = $state<AppointmentStatusJobEcho>(null);
	let assignees = $state<{ id: string; full_name: string }[]>([]);

	// Edit form + status confirm dialogs are click-gated — lazy-load each so the
	// detail page parses just the read-only view and paints instantly.
	let AppointmentForm = $state<
		typeof import('$lib/components/appointments/AppointmentForm.svelte').default | null
	>(null);
	let appointmentFormLoading = $state(false);
	$effect(() => {
		if (!editOpen || AppointmentForm || appointmentFormLoading) return;
		appointmentFormLoading = true;
		void import('$lib/components/appointments/AppointmentForm.svelte').then((m) => {
			AppointmentForm = m.default;
		});
	});

	let ConfirmDialog = $state<
		typeof import('$lib/components/shared/ConfirmDialog.svelte').default | null
	>(null);
	let confirmDialogLoading = $state(false);
	$effect(() => {
		if (!(completeOpen || cancelOpen || noShowOpen) || ConfirmDialog || confirmDialogLoading)
			return;
		confirmDialogLoading = true;
		void import('$lib/components/shared/ConfirmDialog.svelte').then((m) => {
			ConfirmDialog = m.default;
		});
	});

	const isTerminal = $derived.by(() => {
		const s = appointment?.status;
		return s === 'completed' || s === 'cancelled' || s === 'no_show';
	});

	// Assignees power the edit form; load once, lazily — never blocks render.
	let assigneesLoaded = $state(false);
	$effect(() => {
		if (!canEditAssignee || assigneesLoaded) return;
		assigneesLoaded = true;
		void (async () => {
			const aRes = await fetch('/api/appointments/assignees');
			if (aRes.ok) {
				const a = (await aRes.json()) as { assignees: typeof assignees };
				assignees = a.assignees;
			}
		})();
	});

	async function transition(next: 'completed' | 'cancelled' | 'no_show') {
		if (!appointment) return;
		actionLoading = true;
		try {
			const res = await fetch(`/api/appointments/${id}/status`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			const body = await res.json();
			if (!res.ok) {
				toast.error(body.error ?? 'Could not update status.');
				return;
			}
			const merged: AppointmentDetail = {
				...appointment,
				status: body.data.status as AppointmentStatus,
				cancelled_at: body.data.cancelled_at
			};
			appointmentsStore.setDetail(merged);
			appointmentsStore.invalidateList();
			// A completed job visit raises the Invoice-now/later (+ Close/Leave-open) prompt.
			if (next === 'completed' && appointment.job_id) {
				const echo = (body.data?.job ?? null) as AppointmentStatusJobEcho;
				if (shouldPromptVisitComplete(echo, member())) {
					completionEcho = echo;
					visitPromptOpen = true;
				}
			}
		} finally {
			actionLoading = false;
		}
	}

	async function handleEditSubmit(payload: Record<string, unknown>) {
		if (!appointment) return { ok: false, error: 'Not loaded.' };
		try {
			const res = await fetch(`/api/appointments/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const body = await res.json();
			if (!res.ok) {
				return {
					ok: false,
					error: body.error ?? 'Could not save.',
					field_errors: body.field_errors
				};
			}
			appointmentsStore.setDetail(body.data);
			appointmentsStore.invalidateList();
			editOpen = false;
			return { ok: true };
		} catch {
			return { ok: false, error: 'Network error. Try again.' };
		}
	}
</script>

<svelte:head><title>Appointment</title></svelte:head>

<PageWrapper>
	<a href="/appointments" class="btn btn--ghost btn--sm appt-back">
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>Back to appointments</span>
	</a>

	{#if showSkeleton}
		<SkeletonLoader lines={6} height="92px" label="Loading appointment" />
	{:else if !appointment}
		<EmptyState title="Couldn't load appointment" description={detailError ?? 'Not found.'} />
	{:else if appointment}
		<!-- Title + status header -->
		<div class="appt-detail-header">
			<div class="appt-detail-header__main">
				<p class="appt-detail-header__eyebrow">{appointment.contact_name}</p>
				<div class="appt-detail-header__title-row">
					<h1 class="appt-detail-header__title">{appointment.title}</h1>
					{#if appointment.booking_source === 'booking_link'}
						<span class="appt-detail-header__tag">Self-booked</span>
					{/if}
				</div>
			</div>
			<AppointmentStatusBadge status={appointment.status} />
		</div>

		<!-- Two-column layout -->
		<div class="appt-detail">
			<!-- ── LEFT COLUMN ─────────────────────────────────────────────────── -->
			<div class="appt-detail__left">
				<section class="appt-section">
					<div class="appt-section__head">
						<i class="appt-section__icon ri-information-line" aria-hidden="true"></i>
						<h2 class="appt-section__title">Details</h2>
					</div>

					<dl class="appt-meta">
						<div class="appt-meta__row">
							<i class="appt-meta__icon ri-calendar-line" aria-hidden="true"></i>
							<div class="appt-meta__content">
								<dt class="appt-meta__term">When</dt>
								<dd class="appt-meta__desc">
									{#if appointment.all_day}
										{formatInOrgTz(appointment.scheduled_start, orgTz, {
											weekday: 'short',
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}
										<span class="appt-meta__muted"> · Anytime</span>
									{:else}
										{formatDateTimeInOrgTz(appointment.scheduled_start, orgTz)}
										{#if appointment.scheduled_end}
											&ndash; {formatDateTimeInOrgTz(appointment.scheduled_end, orgTz)}
										{/if}
									{/if}
								</dd>
							</div>
						</div>

						<div class="appt-meta__row">
							<i class="appt-meta__icon ri-user-line" aria-hidden="true"></i>
							<div class="appt-meta__content">
								<dt class="appt-meta__term">Crew</dt>
								<dd class="appt-meta__desc">
									{#if appointment.assignees.length === 0}
										<span class="appt-meta__muted">Unassigned</span>
									{:else}
										<ul class="appt-crew">
											{#each appointment.assignees as a (a.id)}
												<li
													class={['appt-crew__chip', a.is_lead && 'appt-crew__chip--lead']
														.filter(Boolean)
														.join(' ')}
												>
													{#if a.is_lead}
														<i class="ri-vip-crown-line" aria-hidden="true"></i>
													{/if}
													<span>{a.full_name}</span>
													{#if a.is_lead}<span class="appt-crew__role">· Lead</span>{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</dd>
							</div>
						</div>

						{#if appointment.location}
							<div class="appt-meta__row">
								<i class="appt-meta__icon ri-map-pin-line" aria-hidden="true"></i>
								<div class="appt-meta__content">
									<dt class="appt-meta__term">Location</dt>
									<dd class="appt-meta__desc">{appointment.location}</dd>
								</div>
							</div>
						{/if}

						{#if appointment.job_id && appointment.job_title}
							<div class="appt-meta__row">
								<i class="appt-meta__icon ri-briefcase-line" aria-hidden="true"></i>
								<div class="appt-meta__content">
									<dt class="appt-meta__term">Linked job</dt>
									<dd class="appt-meta__desc">
										<a class="appt-meta__link" href={`/jobs/${appointment.job_id}`}>
											{appointment.job_title}
										</a>
									</dd>
								</div>
							</div>
						{/if}
					</dl>

					{#if appointment.notes}
						<div class="appt-section__notes">
							<p class="appt-section__notes-label">Notes</p>
							<p class="appt-section__notes-body">{appointment.notes}</p>
						</div>
					{/if}
				</section>

				{#if appointment.booking_source === 'booking_link'}
					{@const referrerLabel = (() => {
						const r = appointment.booking_referrer;
						if (!r) return null;
						const map: Record<string, string> = {
							sms: 'SMS',
							email: 'Email',
							webchat: 'Web chat',
							direct: 'Direct',
							qr: 'QR code'
						};
						return map[r] ?? r.replace(/_/g, ' ');
					})()}
					<section class="appt-section appt-section--booking">
						<div class="appt-section__head">
							<i class="appt-section__icon ri-global-line" aria-hidden="true"></i>
							<h2 class="appt-section__title">Booking details</h2>
						</div>
						<p class="appt-section__subtitle">
							Submitted by the customer through your booking link.
						</p>
						<dl class="appt-submitted">
							{#if appointment.customer_name}
								<div class="appt-submitted__row">
									<dt class="appt-submitted__term">Submitted name</dt>
									<dd class="appt-submitted__desc">{appointment.customer_name}</dd>
								</div>
							{/if}
							{#if appointment.customer_phone}
								<div class="appt-submitted__row">
									<dt class="appt-submitted__term">Submitted phone</dt>
									<dd class="appt-submitted__desc">{appointment.customer_phone}</dd>
								</div>
							{/if}
							{#if appointment.customer_email}
								<div class="appt-submitted__row">
									<dt class="appt-submitted__term">Submitted email</dt>
									<dd class="appt-submitted__desc">{appointment.customer_email}</dd>
								</div>
							{/if}
							{#if appointment.customer_notes}
								<div class="appt-submitted__row">
									<dt class="appt-submitted__term">Notes</dt>
									<dd class="appt-submitted__desc appt-submitted__desc--wrap">
										{appointment.customer_notes}
									</dd>
								</div>
							{/if}
							{#if referrerLabel}
								<div class="appt-submitted__row">
									<dt class="appt-submitted__term">Source</dt>
									<dd class="appt-submitted__desc">{referrerLabel}</dd>
								</div>
							{/if}
						</dl>
					</section>
				{/if}
			</div>

			<!-- ── RIGHT SIDEBAR ───────────────────────────────────────────────── -->
			<aside class="appt-detail__sidebar">
				<div class="appt-side-card">
					<p class="appt-side-card__label">Status</p>
					<div class="appt-side-card__status">
						<AppointmentStatusBadge status={appointment.status} />
					</div>

					{#if canEdit && !isTerminal}
						<div class="appt-side-card__actions">
							<Button variant="outline" class="btn--full" onclick={() => (editOpen = true)}>
								<i class="ri-pencil-line" aria-hidden="true"></i>
								<span>Edit / reschedule</span>
							</Button>
							<button
								type="button"
								class="btn btn--success btn--full"
								disabled={actionLoading}
								onclick={() => (completeOpen = true)}
							>
								Mark complete
							</button>
							<Button
								variant="secondary"
								class="btn--full"
								disabled={actionLoading}
								onclick={() => (noShowOpen = true)}
							>
								Mark no-show
							</Button>
							<Button
								variant="danger-outline"
								class="btn--full"
								disabled={actionLoading}
								onclick={() => (cancelOpen = true)}
							>
								Cancel appointment
							</Button>
						</div>
					{:else}
						<p class="appt-side-card__terminal">
							This appointment is {appointment.status.replace(/_/g, '-')} and can no longer be changed.
						</p>
					{/if}
				</div>
			</aside>
		</div>

		<Sheet.Root bind:open={editOpen}>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>Edit appointment</Sheet.Title>
				</Sheet.Header>
				<div class="appt-edit-sheet__body">
					{#if AppointmentForm}
						<AppointmentForm
							mode="edit"
							{appointment}
							{assignees}
							{canEditAssignee}
							submitLabel="Save changes"
							onCancel={() => (editOpen = false)}
							onSubmit={handleEditSubmit}
						/>
					{:else}
						<SkeletonLoader lines={5} height="44px" label="Loading form" />
					{/if}
				</div>
			</Sheet.Content>
		</Sheet.Root>

		{#if ConfirmDialog}
			<ConfirmDialog
				bind:open={completeOpen}
				title="Mark appointment complete?"
				description="The appointment will be marked completed. Reminders will be cancelled."
				confirmLabel="Mark complete"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('completed');
				}}
			/>

			<ConfirmDialog
				bind:open={noShowOpen}
				title="Mark as no-show?"
				description="Customer didn't show. Reminders will be cancelled."
				confirmLabel="Mark no-show"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('no_show');
				}}
			/>

			<ConfirmDialog
				bind:open={cancelOpen}
				title="Cancel this appointment?"
				description="The appointment will be cancelled. Reminders will be cancelled."
				confirmLabel="Cancel appointment"
				variant="destructive"
				loading={actionLoading}
				onConfirm={async () => {
					await transition('cancelled');
				}}
			/>
		{/if}

		<!-- Post-completion prompt — Invoice now/later (+ Close/Leave-open on the last visit). -->
		{#if appointment.job_id}
			<VisitCompleteActionsDialog
				bind:open={visitPromptOpen}
				jobId={appointment.job_id}
				jobTitle={appointment.job_title}
				echo={completionEcho}
			/>
		{/if}
	{/if}
</PageWrapper>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.appt-back {
		margin-bottom: $space-4;
	}

	/* 2-column grid: left main content / right sticky sidebar */
	.appt-detail {
		display: grid;
		gap: $space-6;

		@media (min-width: $bp-tablet) {
			grid-template-columns: 1fr 320px;
			align-items: start;
		}
	}

	.appt-detail__left {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		min-width: 0;
	}

	.appt-detail__sidebar {
		display: flex;
		flex-direction: column;
		gap: $space-4;

		@media (min-width: $bp-tablet) {
			position: sticky;
			top: calc(var(--header-height) + 16px);
			align-self: flex-start;
		}
	}

	/* Edit sheet body — scrolls inside the fixed right panel */
	.appt-edit-sheet__body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		margin-top: $space-4;
	}
</style>
