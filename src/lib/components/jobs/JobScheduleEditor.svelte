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
	import { WEEKDAY_LONG } from '$lib/jobs/recurrence';
	import type { Snippet } from 'svelte';
	import type { JobFormState, RepeatMode } from '$lib/jobs/jobForm.svelte';

	let {
		form,
		errors = {},
		jobTypeLocked = false,
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
		// TRUE on an existing job: its one-off/recurring type is immutable (Jobber), so the toggle
		// becomes static text. It locks ONLY the toggle — the Repeats dropdown stays editable for
		// both types, because a rule change is a schedule edit, not a type change.
		jobTypeLocked?: boolean;
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

	// ── Inline "Repeats" dropdown labels (Jobber / Google-Calendar model) ────────────
	// The preset option labels name the weekday / nth-of-month of the chosen start date,
	// exactly like Jobber ("Weekly on Tuesday", "Monthly on the 2nd Tuesday"). They read the
	// same anchor the form's presetShape uses, so what you pick matches what you see.
	const NTH_WORDS = ['1st', '2nd', '3rd', '4th'] as const;
	const repeatAnchor = $derived(form.anchorDate());
	const anchorWeekdayLabel = $derived(WEEKDAY_LONG[repeatAnchor.getDay()]);
	const anchorNth = $derived(Math.min(4, Math.ceil(repeatAnchor.getDate() / 7)));
	const monthlyLabel = $derived(
		`Monthly on the ${NTH_WORDS[anchorNth - 1]} ${WEEKDAY_LONG[repeatAnchor.getDay()]}`
	);

	// The options are declared as data and handed to <Select.Root items> as well as rendered from
	// the same array — Bits UI's documented shape. It matters here beyond tidiness: `repeatMode`
	// is $derived off the schedule state, so it settles one tick AFTER the dropdown closes, and a
	// DOM-based label lookup would have nothing left to read.
	// The Repeats dropdown is shown for BOTH job types (Jobber — see ref/job-new/3.jpg, where
	// One-off is active with "Repeats: Does not repeat" right below it). It configures how the
	// job's visits are GENERATED, which is independent of how the job BILLS (the toggle). So a
	// one-off may repeat, and picking a rule never flips the toggle.
	//
	// The only difference between the two modes is "Does not repeat": a recurring job must repeat
	// somehow, so that option is one-off-only. Everything else, including "As needed", is shared.
	const repeatPresets = $derived([
		...(form.jobMode === 'one_off' ? [{ value: 'none', label: 'Does not repeat' }] : []),
		{ value: 'day', label: 'Daily' },
		{ value: 'week1', label: `Weekly on ${anchorWeekdayLabel}` },
		{ value: 'week2', label: `Every 2 weeks on ${anchorWeekdayLabel}` },
		{ value: 'month', label: monthlyLabel },
		{ value: 'as_needed', label: "As needed — we won't prompt you" }
	]);
	// Split from the presets by the "Or" separator below. The saved rule is injected as its own
	// option once one exists, so the trigger reads the rule ("Every 3 weeks on Mon") instead of
	// the "Custom schedule…" action. Picking any other option drops it (setRepeatMode clears it).
	const repeatCustom = $derived([
		{ value: 'custom', label: 'Custom schedule…' },
		...(form.repeatMode === 'custom_saved'
			? [{ value: 'custom_saved', label: form.repeatLabel }]
			: [])
	]);

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
				<Select.Item
					value="both"
					label="SMS + Email"
					disabled={!(contactHasPhone && contactHasEmail)}
				>
					SMS + Email{#if !(contactHasPhone && contactHasEmail)}
						<span class="job-notify-field__why"> — needs both phone & email</span>
					{/if}
				</Select.Item>
				<Select.Item value="sms" label="SMS only" disabled={!contactHasPhone}>
					SMS only{#if !contactHasPhone}
						<span class="job-notify-field__why"> — no phone on file</span>
					{/if}
				</Select.Item>
				<Select.Item value="email" label="Email only" disabled={!contactHasEmail}>
					Email only{#if !contactHasEmail}
						<span class="job-notify-field__why"> — no email on file</span>
					{/if}
				</Select.Item>
				<Select.Item value="none" label="Not set (don't notify)">Not set (don't notify)</Select.Item
				>
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
				{:else if form.recurConfigured}
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

{#snippet repeatsField()}
	<!-- The single inline "Repeats" dropdown (Jobber / Google-Calendar model). Presets name the
	     start date's weekday; "Custom schedule…" opens the rule modal; "As needed" strips the
	     date/time and leaves the job with no visits. -->
	<div class="field">
		<p class="field__label">Repeats</p>
		<Select.Root
			value={form.repeatMode}
			items={[...repeatPresets, ...repeatCustom]}
			onValueChange={(v) => form.setRepeatMode(v as RepeatMode)}
		>
			<Select.Trigger><Select.Value /></Select.Trigger>
			<Select.Content>
				{#each repeatPresets as opt (opt.value)}
					<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
				{/each}
				<p class="repeat-or">Or</p>
				{#each repeatCustom as opt (opt.value)}
					<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		{#if form.repeatMode === 'custom_saved'}
			<p class="field__hint">{form.repeatLabel}</p>
		{/if}
		{#if errors.recurrence}
			<p class="field__error">{errors.recurrence}</p>
		{/if}
	</div>
{/snippet}

<div class="job-section">
	<div class="job-section__head">
		<div class="job-section__head-main">
			<i class="job-section__icon ri-calendar-line" aria-hidden="true"></i>
			<h3 class="job-section__title heading">Schedule</h3>
		</div>
		{#if jobTypeLocked}
			<!-- Existing job: the type is decided and immutable (Jobber), so it reads as a fact,
			     not a control. A disabled toggle would only invite clicks that do nothing. -->
			<span class="job-mode-static">
				{form.jobMode === 'recurring' ? 'Recurring' : 'One-off'}
			</span>
		{:else}
			<!-- Jobber's One-off / Recurring toggle — the SOLE authority for job_type. It decides
			     how the job BILLS; the Repeats dropdown below decides how visits are GENERATED.
			     Neither one rewrites the other (the sole exception: flipping to recurring seeds a
			     weekly rule, since a recurring job is not offered "Does not repeat"). -->
			<div class="job-mode-toggle" role="group" aria-label="Job type">
				<button
					type="button"
					class="job-mode-toggle__btn"
					class:job-mode-toggle__btn--active={form.jobMode === 'one_off'}
					aria-pressed={form.jobMode === 'one_off'}
					onclick={() => form.setJobMode('one_off')}
				>
					One-off
				</button>
				<button
					type="button"
					class="job-mode-toggle__btn"
					class:job-mode-toggle__btn--active={form.jobMode === 'recurring'}
					aria-pressed={form.jobMode === 'recurring'}
					onclick={() => form.setJobMode('recurring')}
				>
					Recurring
				</button>
			</div>
		{/if}
	</div>

	{#if showRebuildNote && form.recurConfigured}
		<p class="recur-note">
			<i class="ri-information-line" aria-hidden="true"></i>
			Saving rebuilds the upcoming visits on the calendar. Past visits and any already-invoiced visits
			stay unchanged.
		</p>
	{/if}

	<!-- "Schedule later": create the job undated with an unscheduled placeholder visit. Keyed off
	     the rule, not the toggle — it is meaningless once a repeat rule / "As needed" governs
	     scheduling, including on a repeating one-off. ('none' is a one-off-only resting state.) -->
	{#if form.repeatMode === 'none'}
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
	{/if}

	{#if form.repeatMode === 'none' && form.scheduleLater}
		<!-- No date and no rule: repeat is meaningless, so the dropdown is hidden here. -->
		<p class="recur-note">
			<i class="ri-calendar-event-line" aria-hidden="true"></i>
			This job will be saved with no date. It appears in the job's Visits list as “To be scheduled” until
			you give it a date.
		</p>
	{:else}
		<!-- Dated schedule — shared by one-off AND recurring, INCLUDING "As needed" (Jobber keeps
		     every field visible for As needed; it just generates no visits). -->
		<div class="job-toggle-row">
			<div class="job-toggle-row__text">
				<p class="job-toggle-row__title">All day / Anytime</p>
				<p class="job-toggle-row__hint">No specific time window</p>
			</div>
			<Switch id="anytime-switch" bind:checked={form.anytime} />
		</div>

		<div class="job-quick-dates">
			<p class="job-quick-dates__label">Quick select</p>
			<div class="job-quick-dates__chips">
				{#each QUICK_DATES as s (s.offset)}
					<button type="button" class="job-quick-date" onclick={() => form.setDateQuick(s.offset)}>
						{s.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="job-schedule-grid" class:job-schedule-grid--oneoff={!form.anytime}>
			<div class="field">
				<p class="field__label field__label--required">
					{form.repeatMode === 'none' ? 'Date' : 'Start date'}
				</p>
				<Calendar
					value={oneoffDate}
					onValueChange={setOneoffDate}
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

		<!-- Shown for BOTH types, and on an existing job too: choosing/changing a repeat rule
		     decides how visits are GENERATED, never the job's type, so it is an ordinary schedule
		     edit the server accepts. job_type stays immutable — the toggle above is what locks. -->
		{@render repeatsField()}

		{#if form.scheduleAsNeeded}
			<p class="recur-note">
				<i class="ri-information-line" aria-hidden="true"></i>
				This job is created with no visits and sits in <strong>Action Required</strong> until you add
				a visit from the job's Visits list.
			</p>
		{/if}

		<!-- Repeat extras: live visit count, end condition, and crew-facing instructions. Keyed off
		     the RULE, not the toggle — a repeating one-off generates a series and needs all of it,
		     while a "Does not repeat" one-off needs none. "As needed" keeps the end condition: it
		     stores the job's window (Jobber) even though it generates no visits. -->
		{#if form.recurConfigured || form.scheduleAsNeeded}
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
							<Select.Trigger><Select.Value placeholder="Set repeat schedule" /></Select.Trigger>
							<Select.Content>
								<Select.Item value="days" label="Days">Days</Select.Item>
								<Select.Item value="weeks" label="Weeks">Weeks</Select.Item>
								<Select.Item value="months" label="Months">Months</Select.Item>
								<Select.Item value="years" label="Years">Years</Select.Item>
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
						<Calendar bind:value={form.endOn} min={oneoffDate} placeholder="Pick an end date" />
					</div>
					{#if errors.end_on}
						<p class="field__error">{errors.end_on}</p>
					{/if}
				{/if}
			</div>

			{#if form.previewError}
				<p class="field__error">{form.previewError}</p>
			{/if}

			{#if !form.scheduleAsNeeded}
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
			{/if}
		{/if}
	{/if}

	{#if notifyVisible && !(form.repeatMode === 'none' && form.scheduleLater) && !form.scheduleAsNeeded}
		{@render notifyField()}
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

	// The same slot as .job-mode-toggle, but on an existing job, where the type is immutable
	// and reads as a static fact. Pill-shaped like a badge so it doesn't look clickable.
	.job-mode-static {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 $space-3;
		border-radius: $radius-full;
		background: var(--color-bg-surface-sunk);
		color: var(--color-text-secondary);
		font-size: $fs-caption;
		font-weight: $weight-medium;
		font-family: $font-body;
	}

	// One-off / Recurring segmented toggle in the schedule head (Jobber). Same look as the
	// %/$ toggle in the billing editor. Only this component uses it, so it stays scoped.
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
			font-weight: $weight-semibold;
			color: var(--color-text-muted);
			cursor: pointer;
			transition: all $duration-fast $ease-standard;

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
