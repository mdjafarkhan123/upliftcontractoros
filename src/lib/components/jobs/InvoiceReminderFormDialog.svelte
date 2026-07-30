<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Calendar } from '$lib/components/ui/calendar';
	import { TimePicker } from '$lib/components/ui/time-picker';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import CrewPicker from '$lib/components/appointments/CrewPicker.svelte';
	import { dateTimeLocalValue } from '$lib/utils/calendar';
	import type { JobInvoiceReminderRow } from '$lib/types/jobs';

	// The New / Edit "invoice reminder" modal (Jobber ref/billing/7). An invoice
	// reminder is a CONTRACTOR to-do — "on this date, remember to invoice this job."
	// Reshaped from EventFormDialog: same Details + Schedule (date/time + Anytime +
	// Schedule-later), PLUS a read-only Job details block, a crew picker, and a
	// "notify team when assigned" toggle. `mode='new'` POSTs; `mode='edit'` PATCHes.
	let {
		open = $bindable(false),
		mode,
		jobId,
		jobTitle,
		jobNumberDisplay = null,
		clientName = null,
		reminder = null,
		onSaved
	}: {
		open?: boolean;
		mode: 'new' | 'edit';
		jobId: string;
		jobTitle: string;
		jobNumberDisplay?: string | null;
		clientName?: string | null;
		reminder?: JobInvoiceReminderRow | null;
		onSaved?: () => void;
	} = $props();

	let description = $state('');
	let scheduleLater = $state(false);
	let anytime = $state(false);
	let startDate = $state('');
	let endDate = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let selectedIds = $state<string[]>([]);
	let leadId = $state<string | null>(null);
	let notifyTeam = $state(false);
	let errorMsg = $state<string | null>(null);

	let assignees = $state<{ id: string; full_name: string }[]>([]);
	let assigneesLoaded = $state(false);

	function splitLocal(iso: string | null): { date: string; time: string } {
		const local = dateTimeLocalValue(iso); // '' when null
		const [date = '', time = ''] = local.split('T');
		return { date, time };
	}

	// (Re)seed the form + load the crew list every time the modal opens.
	$effect(() => {
		if (!open) return;
		errorMsg = null;

		if (mode === 'edit' && reminder) {
			description = reminder.description ?? '';
			scheduleLater = reminder.scheduled_start == null;
			anytime = reminder.all_day;
			const s = splitLocal(reminder.scheduled_start);
			const e = splitLocal(reminder.scheduled_end);
			startDate = s.date;
			startTime = s.time;
			endDate = e.date || s.date;
			endTime = e.time;
			selectedIds = reminder.assignees.map((a) => a.id);
			leadId = reminder.assignees.find((a) => a.is_lead)?.id ?? selectedIds[0] ?? null;
			notifyTeam = reminder.notify_team_on_assign;
		} else {
			description = '';
			scheduleLater = false;
			anytime = false;
			startDate = '';
			startTime = '';
			endDate = '';
			endTime = '';
			selectedIds = [];
			leadId = null;
			notifyTeam = false;
		}

		if (!assigneesLoaded) void loadAssignees();
	});

	async function loadAssignees() {
		try {
			const res = await fetch('/api/appointments/assignees');
			if (res.ok) {
				const body = (await res.json()) as { assignees: { id: string; full_name: string }[] };
				assignees = body.assignees ?? [];
			}
			// A member without appointment perms gets 403 — crew assignment stays optional.
		} catch {
			// Network hiccup — leave the crew list empty; assignment is optional.
		} finally {
			assigneesLoaded = true;
		}
	}

	function plusHour(time: string): string {
		const [h, m] = time.split(':').map(Number);
		if (Number.isNaN(h)) return '';
		const total = Math.min(h * 60 + (m || 0) + 60, 23 * 60 + 59);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
	}

	function onStartTimeChange(v: string) {
		startTime = v;
		if (v && (!endTime || endTime <= v)) endTime = plusHour(v);
	}
	function onStartDateChange(v: string) {
		startDate = v;
		if (!endDate || endDate < v) endDate = v;
	}

	// Resolve the picker fields into the payload's start/end ISO (or null for
	// schedule-later), or throw a user-facing message.
	function resolveSchedule(): { startIso: string | null; endIso: string | null } {
		if (scheduleLater) return { startIso: null, endIso: null };
		if (anytime) {
			if (!startDate) throw new Error('Pick a date.');
			return { startIso: new Date(`${startDate}T12:00:00`).toISOString(), endIso: null };
		}
		if (!startDate || !startTime) throw new Error('Pick a start date and time.');
		if (!endDate || !endTime) throw new Error('Pick an end date and time.');
		const s = new Date(`${startDate}T${startTime}:00`);
		const e = new Date(`${endDate}T${endTime}:00`);
		if (e.getTime() <= s.getTime()) throw new Error('End must be after the start.');
		return { startIso: s.toISOString(), endIso: e.toISOString() };
	}

	async function save() {
		errorMsg = null;

		let startIso: string | null;
		let endIso: string | null;
		try {
			({ startIso, endIso } = resolveSchedule());
		} catch (err) {
			errorMsg = (err as Error).message;
			return;
		}

		const payload = {
			description: description.trim() || null,
			all_day: anytime,
			scheduled_start: startIso,
			scheduled_end: endIso,
			assignee_ids: selectedIds,
			lead_member_id: leadId,
			notify_team_on_assign: notifyTeam
		};

		const url =
			mode === 'edit' && reminder
				? `/api/jobs/${jobId}/reminders/${reminder.id}`
				: `/api/jobs/${jobId}/reminders`;
		const method = mode === 'edit' ? 'PATCH' : 'POST';

		const res = await fetch(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (res.ok) {
			open = false;
			onSaved?.();
			return;
		}

		let msg = mode === 'edit' ? 'Could not save the reminder.' : 'Could not create the reminder.';
		try {
			const body = (await res.json()) as { error?: string };
			if (body?.error) msg = body.error;
		} catch {
			// keep default
		}
		errorMsg = msg;
		// Throw so the Button drops out of its loading state.
		throw new Error(msg);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="event-form" showClose={false}>
		<div class="dialog-content__header">
			<div class="dialog-content__header-main">
				<Dialog.Title
					>{mode === 'edit' ? 'Edit Invoice Reminder' : 'New Invoice Reminder'}</Dialog.Title
				>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="event-form__body">
			<!-- Read-only job details (Jobber ref/billing/7). -->
			<div class="reminder-form__job">
				<i class="ri-briefcase-4-line reminder-form__job-icon" aria-hidden="true"></i>
				<div class="reminder-form__job-text">
					<span class="reminder-form__job-title">
						{jobTitle}{#if jobNumberDisplay}<span class="reminder-form__job-num">
								· {jobNumberDisplay}</span
							>{/if}
					</span>
					{#if clientName}
						<span class="reminder-form__job-client">{clientName}</span>
					{/if}
				</div>
			</div>

			<!-- Details -->
			<div class="event-form__group">
				<div class="event-form__group-field">
					<label class="event-form__mini-label" for="reminder-desc">Details</label>
					<Textarea
						id="reminder-desc"
						placeholder="What to remember (e.g. Invoice after final walkthrough)"
						rows={3}
						bind:value={description}
						maxlength={5000}
						oninput={() => (errorMsg = null)}
					/>
				</div>
			</div>

			<h4 class="event-form__section">Schedule</h4>

			<div class="event-form__schedule">
				{#if !scheduleLater}
					<div class="event-form__dates">
						<div class="field">
							<p class="field__label">Start date</p>
							<Calendar
								value={startDate}
								onValueChange={onStartDateChange}
								placeholder="Start date"
							/>
						</div>
						{#if !anytime}
							<div class="field">
								<p class="field__label">End date</p>
								<Calendar
									value={endDate}
									onValueChange={(v) => (endDate = v)}
									placeholder="End date"
								/>
							</div>
						{/if}
					</div>

					{#if !anytime}
						<div class="event-form__times">
							<div class="field">
								<p class="field__label">Start time</p>
								<TimePicker
									value={startTime}
									onValueChange={onStartTimeChange}
									placeholder="Start time"
								/>
							</div>
							<div class="field">
								<p class="field__label">End time</p>
								<TimePicker
									value={endTime}
									onValueChange={(v) => (endTime = v)}
									min={endDate === startDate ? startTime : ''}
									defaultScroll={startTime || '08:00'}
									placeholder="End time"
								/>
							</div>
						</div>
					{/if}

					<div class="event-form__anytime">
						<Switch id="reminder-anytime" bind:checked={anytime} />
						<label class="event-form__anytime-label" for="reminder-anytime">Anytime</label>
					</div>
				{/if}

				<div class="event-form__anytime">
					<Switch id="reminder-later" bind:checked={scheduleLater} />
					<label class="event-form__anytime-label" for="reminder-later">Schedule later</label>
				</div>
			</div>

			<!-- Team -->
			<h4 class="event-form__section">Team</h4>
			<CrewPicker {assignees} bind:selectedIds bind:leadId />

			<div class="event-form__anytime reminder-form__notify">
				<Switch id="reminder-notify" bind:checked={notifyTeam} />
				<label class="event-form__anytime-label" for="reminder-notify">
					Email the team when assigned
				</label>
			</div>

			{#if errorMsg}
				<p class="event-form__error">{errorMsg}</p>
			{/if}
		</div>

		<div class="event-form__foot">
			<button type="button" class="event-form__cancel" onclick={() => (open = false)}>Cancel</button
			>
			<Button loadingLabel="Saving…" successLabel="Saved" onAction={save}>Save</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.reminder-form__job {
		display: flex;
		align-items: center;
		gap: $space-3;
		padding: $space-3 $space-4;
		background: var(--color-bg-surface-sunk);
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
	}
	.reminder-form__job-icon {
		font-size: 1.5rem;
		color: var(--color-text-muted);
	}
	.reminder-form__job-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.reminder-form__job-title {
		font-size: $fs-body;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}
	.reminder-form__job-num {
		font-weight: $weight-medium;
		color: var(--color-text-muted);
	}
	.reminder-form__job-client {
		font-size: $fs-caption;
		color: var(--color-text-muted);
	}
	.reminder-form__notify {
		margin-top: $space-3;
	}
</style>
