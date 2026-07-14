<script lang="ts">
	// Shared schedule editor for the job form — used by both /jobs/new (create) and the
	// /jobs/[id] inline edit mode. Owns the one-off/recurring toggle, the one-off schedule
	// controls, the recurring panel, and the recurrence live-preview $effect. Reads/writes the
	// shared JobFormState so the two screens stay in lockstep.
	//
	// Page-specific differences are passed as props (the create page shows inline field errors
	// and a notify picker whenever a start is set; the edit page shows a rebuild banner and only
	// surfaces the notify picker when the start actually moves). Assignee placement stays in the
	// pages — it lives in the sidebar on create but inside the schedule card on edit.
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { Calendar } from '$lib/components/ui/calendar';
	import { TimePicker } from '$lib/components/ui/time-picker';
	import JobNotifyPreview from '$lib/components/jobs/JobNotifyPreview.svelte';
	import type { Snippet } from 'svelte';
	import type { JobFormState } from '$lib/jobs/jobForm.svelte';

	let {
		form,
		errors = {},
		showRebuildNote = false,
		notifyVisible = false,
		notifyLabel = 'Send scheduled notification',
		showNotifyHint = false,
		showNotifyPreview = false,
		notifyContactName = '',
		contactSelected = true,
		contactHasPhone = true,
		contactHasEmail = true,
		footer
	}: {
		form: JobFormState;
		errors?: Record<string, string>;
		showRebuildNote?: boolean;
		notifyVisible?: boolean;
		notifyLabel?: string;
		showNotifyHint?: boolean;
		// Show the live message preview + per-job "Edit message" box under the picker. Opt-in so
		// the reschedule-notify on the detail page keeps the plain picker until it's wired too.
		showNotifyPreview?: boolean;
		notifyContactName?: string;
		// Drive which notify channels are offerable. The picker is locked until a client is chosen,
		// and each channel is only enabled when the client can actually be reached on it.
		contactSelected?: boolean;
		contactHasPhone?: boolean;
		contactHasEmail?: boolean;
		// Optional content rendered at the bottom of the schedule card. The detail page uses this
		// to keep the assignee picker inside the schedule card; the create page omits it (its
		// assignee lives in the sidebar).
		footer?: Snippet;
	} = $props();

	const QUICK_DATES = [
		{ label: 'Today', offset: 0 },
		{ label: 'Tomorrow', offset: 1 },
		{ label: 'In 2 days', offset: 2 },
		{ label: 'Next week', offset: 7 }
	];

	function fmtPreviewDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// ── One-off date + time (Jobber "date today, time empty" model) ─────────────────
	// The one-off block is a DATE field (Calendar) plus separate START/END time fields
	// (TimePicker), so a date can be filled with the times left blank. We keep the
	// single source of truth as `scheduledStart` / `scheduledEnd` — plain local strings
	// that are date-only ("yyyy-mm-dd") until a time is chosen, then full
	// "yyyy-mm-ddTHH:mm". The helpers below compose/split those two fields, mirroring the
	// recurring block's start/end helpers.
	const DEFAULT_JOB_MINUTES = 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	const todayStr = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	})();

	const oneoffDate = $derived(form.scheduledStart ? form.scheduledStart.split('T')[0] : '');
	const oneoffStartTime = $derived(
		form.scheduledStart.includes('T') ? form.scheduledStart.split('T')[1] : ''
	);
	const oneoffEndTime = $derived(
		form.scheduledEnd.includes('T') ? form.scheduledEnd.split('T')[1] : ''
	);

	function setOneoffDate(date: string) {
		// Keep whatever times are already chosen; just re-anchor them onto the new date.
		form.scheduledStart = date ? (oneoffStartTime ? `${date}T${oneoffStartTime}` : date) : '';
		form.scheduledEnd = date && oneoffEndTime ? `${date}T${oneoffEndTime}` : '';
	}

	function setOneoffStartTime(time: string) {
		const date = oneoffDate || todayStr;
		if (!time) {
			// Cleared → date stays, time empty (an "any time that day" intent).
			form.scheduledStart = date;
			return;
		}
		form.scheduledStart = `${date}T${time}`;
		// Auto-fill / bump the end to a one-hour window whenever it is empty or no longer
		// after the start (Jobber only makes you pick a start).
		if (!oneoffEndTime || oneoffEndTime <= time) {
			const [h, m] = time.split(':').map(Number);
			const d = new Date();
			d.setHours(h, m + DEFAULT_JOB_MINUTES, 0, 0);
			form.scheduledEnd = `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}
	}

	function setOneoffEndTime(time: string) {
		const date = oneoffDate || todayStr;
		form.scheduledEnd = time ? `${date}T${time}` : '';
	}

	// ── Recurring schedule anchor (Jobber model) ───────────────────────────────────
	// A recurring visit is a same-day window: pick the first-visit DATE, plus a START
	// and END time of day. There is no separate end DATE — when the whole series stops
	// is set by "Ends after / Ends on" below. We keep storing full `scheduledStart` /
	// `scheduledEnd` timestamps (the backend derives each visit's duration from them),
	// but the end is always composed onto the SAME date as the start.
	const recurStartDate = $derived(form.scheduledStart.split('T')[0] ?? '');
	const recurStartTime = $derived(form.scheduledStart.split('T')[1] ?? '');
	const recurEndTime = $derived(form.scheduledEnd.split('T')[1] ?? '');

	function setRecurStartDate(date: string) {
		const time = recurStartTime || '09:00';
		form.scheduledStart = date ? `${date}T${time}` : '';
		// Re-anchor the visit end to the (new) start date, keeping the chosen end time.
		const endTime = recurEndTime;
		form.scheduledEnd = date && endTime ? `${date}T${endTime}` : '';
	}

	function setRecurStartTime(time: string) {
		form.scheduledStart = recurStartDate ? `${recurStartDate}T${time || '09:00'}` : '';
	}

	function setRecurEndTime(time: string) {
		form.scheduledEnd = recurStartDate && time ? `${recurStartDate}T${time}` : '';
	}

	// Debounced live preview: refetch the exact visit count whenever the rule, anchor, or end
	// condition changes. This component only renders while the schedule is editable (always on
	// create; only in edit mode on the detail page), so the effect's lifetime matches "editing".
	$effect(() => {
		const rec = form.buildRecurrence();
		const start = form.scheduledStart;
		// Touch end-condition + anchor deps so the effect re-runs on any change.
		void [form.scheduledEnd, form.endType, form.endAfterCount, form.endAfterUnit, form.endOn];
		if (!rec || !start) {
			form.clearPreview();
			return;
		}
		const startIso = new Date(start).toISOString();
		const timer = setTimeout(() => form.runPreview(startIso, rec), 250);
		return () => clearTimeout(timer);
	});
</script>

{#snippet notifyField()}
	<div class="field job-notify-field">
		<p class="field__label">
			<i class="ri-notification-3-line" aria-hidden="true"></i>
			{notifyLabel}
		</p>
		<Select.Root bind:value={form.notifyChannel} disabled={!contactSelected}>
			<Select.Trigger><Select.Value /></Select.Trigger>
			<Select.Content>
				<Select.Item value="both" disabled={!(contactHasPhone && contactHasEmail)}>
					SMS + Email{#if !(contactHasPhone && contactHasEmail)}
						<span class="job-notify-field__why"> — needs both phone & email</span>
					{/if}
				</Select.Item>
				<Select.Item value="sms" disabled={!contactHasPhone}>
					SMS only{#if !contactHasPhone}
						<span class="job-notify-field__why"> — no phone on file</span>
					{/if}
				</Select.Item>
				<Select.Item value="email" disabled={!contactHasEmail}>
					Email only{#if !contactHasEmail}
						<span class="job-notify-field__why"> — no email on file</span>
					{/if}
				</Select.Item>
				<Select.Item value="none">Not set (don't notify)</Select.Item>
			</Select.Content>
		</Select.Root>
		{#if !contactSelected}
			<p class="field__hint">
				<i class="ri-information-line" aria-hidden="true"></i>
				Select a client first to choose how they're notified.
			</p>
		{:else if showNotifyHint}
			<p class="field__hint">
				{#if form.notifyChannel === 'none'}
					The client won't be notified about this schedule.
				{:else if form.jobMode === 'recurring'}
					One confirmation is sent for the series when the job is created.
				{:else}
					The client gets a confirmation when the job is created.
				{/if}
			</p>
		{/if}
		{#if showNotifyPreview && contactSelected && form.notifyChannel !== 'none'}
			<JobNotifyPreview {form} contactName={notifyContactName} />
		{/if}
	</div>
{/snippet}

<div class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="job-section__icon ri-calendar-line" aria-hidden="true"></i>
			<h3 class="job-section__title heading">Schedule</h3>
		</div>
		<div class="job-mode-toggle" role="group" aria-label="Job repeat type">
			<button
				type="button"
				class="job-mode-toggle__btn"
				class:job-mode-toggle__btn--active={form.jobMode === 'one_off'}
				aria-pressed={form.jobMode === 'one_off'}
				onclick={() => (form.jobMode = 'one_off')}
			>
				One-off
			</button>
			<button
				type="button"
				class="job-mode-toggle__btn"
				class:job-mode-toggle__btn--active={form.jobMode === 'recurring'}
				aria-pressed={form.jobMode === 'recurring'}
				onclick={() => (form.jobMode = 'recurring')}
			>
				Recurring
			</button>
		</div>
	</div>

	{#if form.jobMode === 'one_off'}
		<div class="job-toggle-row">
			<div class="job-toggle-row__text">
				<p class="job-toggle-row__title">Schedule later</p>
				<p class="job-toggle-row__hint">
					Skip the date for now — the job gets an unscheduled visit you can date from its Visits
					list.
				</p>
			</div>
			<Switch id="schedule-later-switch" bind:checked={form.scheduleLater} />
		</div>

		{#if form.scheduleLater}
			<p class="recur-note">
				<i class="ri-calendar-event-line" aria-hidden="true"></i>
				This job will be saved with no date. It appears in the job's Visits list as “To be scheduled”
				until you give it a date.
			</p>
		{:else}
			<div class="job-toggle-row">
				<div class="job-toggle-row__text">
					<p class="job-toggle-row__title">All day / Anytime</p>
					<p class="job-toggle-row__hint">No specific time window needed</p>
				</div>
				<Switch id="anytime-switch" bind:checked={form.anytime} />
			</div>

			<div class="job-quick-dates">
				<p class="job-quick-dates__label">Quick select</p>
				<div class="job-quick-dates__chips">
					{#each QUICK_DATES as s (s.offset)}
						<button
							type="button"
							class="job-quick-date"
							onclick={() => form.setDateQuick(s.offset)}
						>
							{s.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="job-schedule-grid" class:job-schedule-grid--oneoff={!form.anytime}>
				<div class="field">
					<p class="field__label field__label--required">Date</p>
					<Calendar
						value={oneoffDate}
						onValueChange={setOneoffDate}
						min={todayStr}
						placeholder="Pick a date"
					/>
					{#if errors.scheduledStart}
						<p class="field__error">{errors.scheduledStart}</p>
					{/if}
				</div>
				{#if !form.anytime}
					<div class="field">
						<p class="field__label">Start time</p>
						<TimePicker
							value={oneoffStartTime}
							onValueChange={setOneoffStartTime}
							preferNow={oneoffDate === todayStr}
							placeholder="Start time"
						/>
						{#if errors.scheduledStartTime}
							<p class="field__error">{errors.scheduledStartTime}</p>
						{/if}
					</div>
					<div class="field">
						<p class="field__label">End time</p>
						<TimePicker
							value={oneoffEndTime}
							onValueChange={setOneoffEndTime}
							min={oneoffStartTime}
							defaultScroll={oneoffStartTime || '08:00'}
							placeholder="End time"
						/>
						{#if errors.scheduledEnd}
							<p class="field__error">{errors.scheduledEnd}</p>
						{/if}
					</div>
				{/if}
			</div>

			{#if form.estimatedDuration}
				<div class="job-duration-hint">
					<i class="ri-time-line" aria-hidden="true"></i>
					{form.estimatedDuration}
				</div>
			{/if}

			{#if notifyVisible}
				{@render notifyField()}
			{/if}
		{/if}
	{:else}
		<!-- ── Recurring panel ─────────────────────────────────────────────────── -->
		{#if showRebuildNote}
			<p class="recur-note">
				<i class="ri-information-line" aria-hidden="true"></i>
				Saving rebuilds the upcoming visits on the calendar. Past visits and any already-invoiced visits
				stay unchanged.
			</p>
		{/if}

		{#if form.recurConfigured}
			<div class="recur-summary">
				{#if form.previewLoading && !form.preview}
					<span class="recur-summary__item recur-summary__item--muted">Calculating visits…</span>
				{:else if form.preview}
					<span class="recur-summary__item">
						Total visits <strong>{form.preview.count}</strong>
					</span>
					{#if form.preview.first}
						<span class="recur-summary__sep" aria-hidden="true"></span>
						<span class="recur-summary__item">First {fmtPreviewDate(form.preview.first)}</span>
					{/if}
					{#if form.preview.last}
						<span class="recur-summary__sep" aria-hidden="true"></span>
						<span class="recur-summary__item">Last {fmtPreviewDate(form.preview.last)}</span>
					{/if}
					<span class="recur-summary__sep" aria-hidden="true"></span>
					<span class="recur-summary__item recur-summary__item--muted">{form.repeatShort}</span>
				{/if}
			</div>
		{/if}

		<div class="job-toggle-row">
			<div class="job-toggle-row__text">
				<p class="job-toggle-row__title">All day / Anytime</p>
				<p class="job-toggle-row__hint">No specific time window for each visit</p>
			</div>
			<Switch id="recur-anytime-switch" bind:checked={form.anytime} />
		</div>

		<!-- Same-day visit window: first-visit date + start/end time of day. The series end
		     (Ends after / Ends on) is set below — there is deliberately no end DATE here. -->
		<div class="job-schedule-grid" class:job-schedule-grid--recur={!form.anytime}>
			<div class="field">
				<p class="field__label field__label--required">Start date</p>
				<input
					type="date"
					class="field__input"
					value={recurStartDate}
					oninput={(e) => setRecurStartDate(e.currentTarget.value)}
					aria-label="First visit date"
				/>
				{#if errors.scheduledStart}
					<p class="field__error">{errors.scheduledStart}</p>
				{/if}
			</div>
			{#if !form.anytime}
				<div class="field">
					<p class="field__label">Start time</p>
					<input
						type="time"
						class="field__input"
						value={recurStartTime}
						oninput={(e) => setRecurStartTime(e.currentTarget.value)}
						aria-label="Visit start time"
					/>
				</div>
				<div class="field">
					<p class="field__label">End time</p>
					<input
						type="time"
						class="field__input"
						value={recurEndTime}
						oninput={(e) => setRecurEndTime(e.currentTarget.value)}
						aria-label="Visit end time"
					/>
					{#if errors.scheduledEnd}
						<p class="field__error">{errors.scheduledEnd}</p>
					{/if}
				</div>
			{/if}
		</div>

		<div class="field">
			<p class="field__label">Repeats</p>
			<button type="button" class="recur-repeats" onclick={() => (form.recurModalOpen = true)}>
				<span class:recur-repeats__placeholder={!form.recurConfigured}>
					{form.recurConfigured ? form.repeatLabel : 'Set up recurring schedule'}
				</span>
				<i class="ri-arrow-down-s-line" aria-hidden="true"></i>
			</button>
			{#if errors.recurrence}
				<p class="field__error">{errors.recurrence}</p>
			{/if}
		</div>

		<div class="recur-end">
			<label class="recur-end__opt">
				<input type="radio" bind:group={form.endType} value="after" />
				<span>Ends after</span>
			</label>
			{#if form.endType === 'after'}
				<div class="recur-end__after">
					<input
						type="number"
						min="1"
						max="999"
						class="field__input recur-end__count"
						bind:value={form.endAfterCount}
						aria-label="Number of"
					/>
					<Select.Root bind:value={form.endAfterUnit}>
						<Select.Trigger><Select.Value /></Select.Trigger>
						<Select.Content>
							<Select.Item value="days">Days</Select.Item>
							<Select.Item value="weeks">Weeks</Select.Item>
							<Select.Item value="months">Months</Select.Item>
							<Select.Item value="years">Years</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
				{#if errors.end_after_count}
					<p class="field__error">{errors.end_after_count}</p>
				{/if}
			{/if}

			<label class="recur-end__opt">
				<input type="radio" bind:group={form.endType} value="on" />
				<span>Ends on</span>
			</label>
			{#if form.endType === 'on'}
				<div class="recur-end__date">
					<Calendar bind:value={form.endOn} min={recurStartDate} placeholder="Pick an end date" />
				</div>
				{#if errors.end_on}
					<p class="field__error">{errors.end_on}</p>
				{/if}
			{/if}
		</div>

		{#if form.previewError}
			<p class="field__error">{form.previewError}</p>
		{/if}

		<div class="field">
			<label class="field__label" for="visit-instructions">Visit instructions</label>
			<p class="field__hint">Copied onto every generated visit for your crew</p>
			<textarea
				id="visit-instructions"
				class="field__textarea"
				rows={3}
				maxlength="2000"
				bind:value={form.visitInstructions}
				placeholder="Access code, gate code, what to bring, client preferences…"
			></textarea>
		</div>

		{#if notifyVisible}
			{@render notifyField()}
		{/if}
	{/if}

	{@render footer?.()}
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-notify-field {
		margin-top: $space-3;

		&__why {
			color: var(--color-text-muted);
			font-size: $fs-body;
		}
	}

	.job-mode-toggle {
		display: inline-flex;
		padding: 3px;
		gap: 2px;
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);

		&__btn {
			border: none;
			background: transparent;
			padding: $space-1 $space-3;
			border-radius: calc(#{$radius-md} - 2px);
			font-size: $fs-body;
			font-weight: 600;
			color: var(--color-text-muted);
			cursor: pointer;
			transition: all 0.12s ease;

			&--active {
				background: var(--color-bg-surface);
				color: var(--color-brand);
				box-shadow: var(--shadow-sm);
			}
		}
	}

	.recur-note {
		display: flex;
		gap: $space-2;
		margin-bottom: $space-4;
		padding: $space-3;
		border-radius: $radius-md;
		background: var(--color-bg-surface-sunk);
		font-size: $fs-body;
		color: var(--color-text-secondary);

		i {
			color: var(--color-brand);
			flex-shrink: 0;
		}
	}

	.recur-summary {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: $space-2;
		margin-bottom: $space-4;
		font-size: $fs-body;
		color: var(--color-text-secondary);

		strong {
			color: var(--color-text-primary);
			font-weight: 700;
		}

		&__item--muted {
			color: var(--color-text-muted);
		}

		&__sep {
			width: 1px;
			height: 14px;
			background: var(--color-border);
		}
	}

	.recur-repeats {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: $space-3;
		border: 1px solid var(--color-border);
		border-radius: $radius-md;
		background: var(--color-bg-surface);
		color: var(--color-text-primary);
		font-size: $fs-body;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.12s ease;

		&:hover {
			border-color: var(--color-brand);
		}

		i {
			color: var(--color-text-muted);
			font-size: 1.25rem;
		}

		&__placeholder {
			color: var(--color-text-muted);
			font-weight: 500;
		}
	}

	.recur-end {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		margin-top: $space-4;

		&__opt {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			font-weight: 500;
			color: var(--color-text-primary);
			cursor: pointer;

			input {
				accent-color: var(--color-brand);
				width: 18px;
				height: 18px;
			}
		}

		&__after {
			display: flex;
			gap: $space-2;
			padding-left: calc(18px + #{$space-2});
		}

		&__count {
			width: 100px;
		}

		&__date {
			margin-left: calc(18px + #{$space-2});
			max-width: 220px;
		}
	}
</style>
