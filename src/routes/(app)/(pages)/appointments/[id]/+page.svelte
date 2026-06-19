<script lang="ts">
	import type { PageData } from './$types';
	import PageWrapper from '$lib/components/shared/PageWrapper.svelte';
	import SkeletonLoader from '$lib/components/shared/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/shared/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import {
		ArrowLeft,
		Pencil,
		MapPin,
		User,
		Calendar,
		Briefcase,
		Globe,
		Crown
	} from '@lucide/svelte';
	import AppointmentStatusBadge from '$lib/components/appointments/AppointmentStatusBadge.svelte';
	import AppointmentForm from '$lib/components/appointments/AppointmentForm.svelte';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { getMemberContext } from '$lib/context/member';
	import { formatDateTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import { toast } from '$lib/stores/toast.svelte';
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
	let assignees = $state<{ id: string; full_name: string }[]>([]);

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
	<Button variant="ghost" href="/appointments" class="mb-4">
		<ArrowLeft class="h-4 w-4" /> Back to appointments
	</Button>

	{#if showSkeleton}
		<SkeletonLoader lines={6} height="92px" label="Loading appointment" />
	{:else if !appointment}
		<EmptyState title="Couldn't load appointment" description={detailError ?? 'Not found.'} />
	{:else if appointment}
		<div class="space-y-4">
			<header class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs font-medium text-muted-foreground">{appointment.contact_name}</p>
						<div class="mt-0.5 flex items-center gap-2">
							<h1 class="text-xl font-semibold leading-tight text-foreground">
								{appointment.title}
							</h1>
							{#if appointment.booking_source === 'booking_link'}
								<span
									class="inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
								>
									Self-booked
								</span>
							{/if}
						</div>
					</div>
					<AppointmentStatusBadge status={appointment.status} />
				</div>

				{#if canEdit && !isTerminal}
					<div class="mt-3">
						<Button variant="outline" class="w-full" onclick={() => (editOpen = true)}>
							<Pencil class="h-4 w-4" /> Edit / reschedule
						</Button>
					</div>
				{/if}
			</header>

			<section class="rounded-xl border border-border bg-card p-4">
				<dl class="space-y-3 text-sm">
					<div class="flex items-start gap-2">
						<Calendar class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
						<div>
							<dt class="text-xs font-medium text-muted-foreground">When</dt>
							<dd class="text-foreground">
								{formatDateTimeInOrgTz(appointment.scheduled_start, orgTz)}
								{#if appointment.scheduled_end}
									– {formatDateTimeInOrgTz(appointment.scheduled_end, orgTz)}
								{/if}
							</dd>
						</div>
					</div>

					<div class="flex items-start gap-2">
						<User class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<dt class="text-xs font-medium text-muted-foreground">Crew</dt>
							<dd class="mt-1">
								{#if appointment.assignees.length === 0}
									<span class="text-sm italic text-muted-foreground">Unassigned</span>
								{:else}
									<ul class="flex flex-wrap gap-1.5">
										{#each appointment.assignees as a (a.id)}
											<li
												class={[
													'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
													a.is_lead
														? 'bg-primary/10 text-primary'
														: 'bg-secondary text-secondary-foreground'
												].join(' ')}
											>
												{#if a.is_lead}<Crown class="h-3 w-3" />{/if}
												<span>{a.full_name}</span>
												{#if a.is_lead}<span class="text-[10px] opacity-70">· Lead</span>{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</dd>
						</div>
					</div>

					{#if appointment.location}
						<div class="flex items-start gap-2">
							<MapPin class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Location</dt>
								<dd class="text-foreground">{appointment.location}</dd>
							</div>
						</div>
					{/if}

					{#if appointment.job_id && appointment.job_title}
						<div class="flex items-start gap-2">
							<Briefcase class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Linked job</dt>
								<dd>
									<a class="text-primary hover:underline" href={`/jobs/${appointment.job_id}`}>
										{appointment.job_title}
									</a>
								</dd>
							</div>
						</div>
					{/if}
				</dl>

				{#if appointment.notes}
					<div class="mt-3 border-t border-border pt-3">
						<p class="text-xs font-medium text-muted-foreground">Notes</p>
						<p class="mt-1 whitespace-pre-wrap text-sm text-foreground">{appointment.notes}</p>
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
				<section class="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4">
					<div class="mb-3 flex items-center gap-2">
						<Globe class="h-4 w-4 text-muted-foreground" />
						<h2 class="text-sm font-semibold text-foreground">Booking Details</h2>
					</div>
					<p class="mb-3 text-xs text-muted-foreground">
						Submitted by the customer through your booking link.
					</p>
					<dl class="space-y-2 text-sm">
						{#if appointment.customer_name}
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Submitted name</dt>
								<dd class="text-foreground">{appointment.customer_name}</dd>
							</div>
						{/if}
						{#if appointment.customer_phone}
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Submitted phone</dt>
								<dd class="text-foreground">{appointment.customer_phone}</dd>
							</div>
						{/if}
						{#if appointment.customer_email}
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Submitted email</dt>
								<dd class="text-foreground">{appointment.customer_email}</dd>
							</div>
						{/if}
						{#if appointment.customer_notes}
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Notes</dt>
								<dd class="whitespace-pre-wrap text-foreground">{appointment.customer_notes}</dd>
							</div>
						{/if}
						{#if referrerLabel}
							<div>
								<dt class="text-xs font-medium text-muted-foreground">Source</dt>
								<dd class="text-foreground">{referrerLabel}</dd>
							</div>
						{/if}
					</dl>
				</section>
			{/if}

			{#if canEdit && !isTerminal}
				<section class="grid grid-cols-1 gap-2 sm:grid-cols-3">
					<Button variant="default" disabled={actionLoading} onclick={() => (completeOpen = true)}>
						Complete
					</Button>
					<Button variant="outline" disabled={actionLoading} onclick={() => (noShowOpen = true)}>
						No-show
					</Button>
					<Button
						variant="destructive"
						disabled={actionLoading}
						onclick={() => (cancelOpen = true)}
					>
						Cancel
					</Button>
				</section>
			{/if}
		</div>

		<Sheet.Root bind:open={editOpen}>
			<Sheet.Content side="bottom" class="max-h-[92vh] overflow-y-auto">
				<Sheet.Header>
					<Sheet.Title>Edit appointment</Sheet.Title>
				</Sheet.Header>
				<div class="mt-4">
					<AppointmentForm
						mode="edit"
						{appointment}
						{assignees}
						{canEditAssignee}
						submitLabel="Save changes"
						onCancel={() => (editOpen = false)}
						onSubmit={handleEditSubmit}
					/>
				</div>
			</Sheet.Content>
		</Sheet.Root>

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
</PageWrapper>
