<script lang="ts">
	// Shared "Schedule a visit" modal (Jobber ref/4-5). ONE surface reused for:
	//   • the pencil on a visit row (edit an existing visit / give a placeholder a date)
	//   • the "+" add-visit button (create a new visit)
	//   • "Schedule new visit" from the completion popup (create a follow-up visit)
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Calendar } from '$lib/components/ui/calendar';
	import { TimePicker } from '$lib/components/ui/time-picker';
	import CrewPicker from '$lib/components/appointments/CrewPicker.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { JobVisitRow } from '$lib/types/jobs';

	type Assignee = { id: string; full_name: string };
	export type VisitJobInfo = {
		title: string;
		jobNumber: number | null;
		contactId: string;
		contactName: string;
		contactPhone: string | null;
		address: string | null;
	};

	let {
		open = $bindable(false),
		mode,
		jobId,
		jobInfo,
		visit = null,
		onSaved,
		onCancel
	}: {
		open?: boolean;
		mode: 'create' | 'edit';
		jobId: string;
		jobInfo: VisitJobInfo;
		visit?: JobVisitRow | null;
		onSaved?: () => void;
		onCancel?: () => void;
	} = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	const todayStr = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	})();

	let title = $state('');
	let instructions = $state('');
	let dateStr = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let scheduleLater = $state(false);
	let anytime = $state(false);
	let selectedIds = $state<string[]>([]);
	let leadId = $state<string | null>(null);

	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let fieldErrors = $state<Record<string, string>>({});

	let assignees = $state<Assignee[]>([]);
	let assigneesLoaded = false;
	async function loadAssignees() {
		if (assigneesLoaded) return;
		try {
			const res = await fetch('/api/appointments/assignees');
			if (!res.ok) return;
			const body = (await res.json()) as { assignees: Assignee[] };
			assignees = body.assignees;
			assigneesLoaded = true;
		} catch {
			/* non-fatal: crew stays empty, visit can still be saved unassigned */
		}
	}

	function splitTime(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}
	function splitDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	const defaultVisitTitle = $derived(`${jobInfo.contactName} - ${jobInfo.title}`);

	function seed() {
		errorMsg = null;
		fieldErrors = {};
		if (mode === 'edit' && visit) {
			title = visit.title || defaultVisitTitle;
			instructions = visit.notes ?? '';
			const hasDate = visit.scheduled_start !== null;
			scheduleLater = !hasDate;
			anytime = hasDate && visit.scheduled_end === null;
			dateStr = hasDate ? splitDate(visit.scheduled_start) : todayStr;
			startTime = anytime ? '' : splitTime(visit.scheduled_start);
			endTime = anytime ? '' : splitTime(visit.scheduled_end);
			selectedIds = [];
			leadId = null;
			void loadVisitCrew(visit.id);
		} else {
			title = defaultVisitTitle;
			instructions = '';
			scheduleLater = false;
			anytime = false;
			dateStr = todayStr;
			startTime = '';
			endTime = '';
			selectedIds = [];
			leadId = null;
		}
	}

	let crewToken = 0;
	async function loadVisitCrew(visitId: string) {
		const token = ++crewToken;
		try {
			const res = await fetch(`/api/appointments/${visitId}`);
			if (!res.ok || token !== crewToken) return;
			const body = (await res.json()) as {
				data: { assignees: { id: string; is_lead: boolean }[] };
			};
			if (token !== crewToken) return;
			selectedIds = body.data.assignees.map((a) => a.id);
			leadId = body.data.assignees.find((a) => a.is_lead)?.id ?? selectedIds[0] ?? null;
		} catch {
			/* non-fatal: crew stays empty, user can re-pick */
		}
	}

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			seed();
			void loadAssignees();
		}
		wasOpen = open;
	});

	function setDate(d: string) {
		dateStr = d;
	}
	function setStart(t: string) {
		startTime = t;
		if (t && (!endTime || endTime <= t)) {
			const [h, m] = t.split(':').map(Number);
			const d = new Date();
			d.setHours(h, m + 60, 0, 0);
			endTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
	}
	function setEnd(t: string) {
		endTime = t;
	}

	function validate(): boolean {
		fieldErrors = {};
		if (!title.trim()) {
			fieldErrors.title = 'Title is required.';
			return false;
		}
		if (scheduleLater) return true;
		if (!dateStr) {
			fieldErrors.date = 'Pick a date.';
			return false;
		}
		if (!anytime) {
			if (!startTime) {
				fieldErrors.startTime = 'Pick a start time.';
				return false;
			}
			if (!endTime) {
				fieldErrors.endTime = 'Pick an end time.';
				return false;
			}
			if (endTime <= startTime) {
				fieldErrors.endTime = 'End must be after start.';
				return false;
			}
		}
		return true;
	}

	function close() {
		open = false;
		onCancel?.();
	}

	async function save() {
		if (saving) return;
		if (!validate()) return;
		saving = true;
		errorMsg = null;
		try {
			const start = scheduleLater ? null : anytime ? `${dateStr}T00:00` : `${dateStr}T${startTime}`;
			const end = scheduleLater || anytime ? null : `${dateStr}T${endTime}`;

			let res: Response;
			if (mode === 'edit' && visit) {
				const body: Record<string, unknown> = {
					title: title.trim(),
					notes: instructions.trim() || null,
					all_day: anytime,
					assignee_ids: selectedIds,
					lead_member_id: selectedIds.length > 0 ? leadId : null
				};
				if (scheduleLater) body.scheduled_start = null;
				else if (start) body.scheduled_start = start;
				if (end) body.scheduled_end = end;
				res = await fetch(`/api/appointments/${visit.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				});
			} else {
				res = await fetch('/api/appointments', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						contact_id: jobInfo.contactId,
						job_id: jobId,
						type: 'job_start',
						title: title.trim(),
						all_day: anytime,
						scheduled_start: start,
						scheduled_end: end,
						notes: instructions.trim() || null,
						assignee_ids: selectedIds,
						lead_member_id: selectedIds.length > 0 ? leadId : null
					})
				});
			}

			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (payload.field_errors) fieldErrors = payload.field_errors;
				errorMsg = payload.error ?? 'Could not save the visit.';
				return;
			}
			toast.success(mode === 'edit' ? 'Visit updated' : 'Visit scheduled');
			open = false;
			onSaved?.();
		} catch {
			errorMsg = 'Network error. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={(o) => !o && close()}>
	<Dialog.Content class="dialog-content--wide">
		<Dialog.Header>
			<Dialog.Title>
				{mode === 'edit' ? 'Edit visit' : 'Schedule a visit'}
			</Dialog.Title>
		</Dialog.Header>

		<div class="dialog-content__body">
			<div class="visit-schedule__grid">
				<div class="visit-schedule__main">
					<div class="field">
						<label class="field__label field__label--required" for="visit-title">Title</label>
						<input
							id="visit-title"
							class="field__input"
							bind:value={title}
							maxlength="200"
							placeholder="Visit title"
						/>
						{#if fieldErrors.title}<p class="field__error">{fieldErrors.title}</p>{/if}
					</div>
					<div class="field">
						<label class="field__label" for="visit-instructions">Instructions</label>
						<textarea
							id="visit-instructions"
							class="field__textarea"
							rows="4"
							maxlength="5000"
							bind:value={instructions}
							placeholder="Access code, what to bring, client preferences…"
						></textarea>
					</div>
				</div>

				<aside class="visit-schedule__panel">
					<h3 class="visit-schedule__panel-title">Job details</h3>
					<dl class="visit-schedule__facts">
						{#if jobInfo.jobNumber !== null}
							<dt>Job #</dt>
							<dd>{jobInfo.jobNumber}</dd>
						{/if}
						<dt>Client</dt>
						<dd>{jobInfo.contactName}</dd>
						{#if jobInfo.contactPhone}
							<dt>Phone</dt>
							<dd>{jobInfo.contactPhone}</dd>
						{/if}
						{#if jobInfo.address}
							<dt>Address</dt>
							<dd>{jobInfo.address}</dd>
						{/if}
					</dl>
				</aside>
			</div>

			<div class="visit-schedule__lower">
				<div class="visit-schedule__main">
					<h3 class="visit-schedule__section-head">Schedule</h3>

					{#if !scheduleLater}
						<div class="visit-schedule__fields" class:visit-schedule__fields--timed={!anytime}>
							<div class="field">
								<p class="field__label field__label--required">Date</p>
								<Calendar
									value={dateStr}
									onValueChange={setDate}
									placeholder="Pick a date"
								/>
								{#if fieldErrors.date}<p class="field__error">{fieldErrors.date}</p>{/if}
							</div>
							{#if !anytime}
								<div class="field">
									<p class="field__label">Start time</p>
									<TimePicker
										value={startTime}
										onValueChange={setStart}
										preferNow={dateStr === todayStr}
										placeholder="Start time"
									/>
									{#if fieldErrors.startTime}<p class="field__error">{fieldErrors.startTime}</p>{/if}
								</div>
								<div class="field">
									<p class="field__label">End time</p>
									<TimePicker
										value={endTime}
										onValueChange={setEnd}
										min={startTime}
										defaultScroll={startTime || '08:00'}
										placeholder="End time"
									/>
									{#if fieldErrors.endTime}<p class="field__error">{fieldErrors.endTime}</p>{/if}
								</div>
							{/if}
						</div>
					{/if}

					<div class="visit-schedule__toggles">
						<label class="visit-schedule__toggle">
							<Switch id="visit-schedule-later" bind:checked={scheduleLater} />
							<span>Schedule later</span>
						</label>
						{#if !scheduleLater}
							<label class="visit-schedule__toggle">
								<Switch id="visit-anytime" bind:checked={anytime} />
								<span>Anytime</span>
							</label>
						{/if}
					</div>

					{#if scheduleLater}
						<p class="visit-schedule__hint">
							<i class="ri-calendar-event-line" aria-hidden="true"></i>
							Saved with no date — it appears under "To be scheduled" until you give it a date.
						</p>
					{/if}
				</div>

				<div class="visit-schedule__main">
					<h3 class="visit-schedule__section-head">Team</h3>
					<CrewPicker {assignees} bind:selectedIds bind:leadId />
				</div>
			</div>

			{#if errorMsg}
				<p class="visit-schedule__error">{errorMsg}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="ghost" onclick={close} disabled={saving}>Cancel</Button>
			<Button loading={saving} onclick={save}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.visit-schedule__grid {
		display: grid;
		grid-template-columns: 1fr 260px;
		gap: $space-5;
	}

	.visit-schedule__lower {
		display: flex;
		flex-direction: column;
		gap: $space-5;
		margin-top: $space-5;
		padding-top: $space-5;
		border-top: 1px solid var(--color-border);
	}

	.visit-schedule__main {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		min-width: 0;
	}

	.visit-schedule__panel {
		padding: $space-4;
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);
		align-self: start;
	}

	.visit-schedule__panel-title {
		margin: 0 0 $space-3;
		font-size: $fs-body;
		font-weight: $weight-bold;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
	}

	.visit-schedule__facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: $space-2 $space-3;
		margin: 0;
		font-size: $fs-body;

		dt {
			color: var(--color-text-muted);
		}

		dd {
			margin: 0;
			color: var(--color-text-primary);
			font-weight: $weight-semibold;
		}
	}

	.visit-schedule__section-head {
		margin: 0;
		font-size: $fs-lg;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	.visit-schedule__fields {
		display: grid;
		grid-template-columns: 1fr;
		gap: $space-3;
	}

	.visit-schedule__fields--timed {
		grid-template-columns: 1.4fr 1fr 1fr;
	}

	.visit-schedule__toggles {
		display: flex;
		flex-wrap: wrap;
		gap: $space-5;
	}

	.visit-schedule__toggle {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		font-size: $fs-body;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
		cursor: pointer;
	}

	.visit-schedule__hint {
		display: flex;
		gap: $space-2;
		padding: $space-3;
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);
		font-size: $fs-body;
		color: var(--color-text-secondary);
	}

	.visit-schedule__hint i {
		color: var(--color-brand);
		flex-shrink: 0;
	}

	.visit-schedule__error {
		margin: $space-4 0 0;
		font-size: $fs-body;
		color: var(--danger-text);
	}

	@media (max-width: 720px) {
		.visit-schedule__grid {
			grid-template-columns: 1fr;
		}

		.visit-schedule__fields--timed {
			grid-template-columns: 1fr;
		}
	}
</style>
