<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Calendar } from '$lib/components/ui/calendar';
	import { TimePicker } from '$lib/components/ui/time-picker';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { dateTimeLocalValue } from '$lib/utils/calendar';
	import type { EventListItem } from '$lib/types/events';

	// The one shared New / Edit Event modal (Jobber ref/event/2,3,5). A single component
	// serves both: `mode='new'` POSTs /api/events; `mode='edit'` PATCHes /api/events/[id].
	// Fields mirror Jobber's event form exactly — title, description, a start/end date +
	// start/end time, and an "Anytime" (all-day) toggle. Customer/crew are intentionally
	// absent (Jobber's event form has none). The Repeats field is DEFERRED (no recurrence
	// backend yet — see memory calendar-events-build "Deferred work").
	let {
		open = $bindable(false),
		mode,
		// Edit: the event being edited. New: an optional seed (title + schedule) carried
		// from the quick-create popover's "More options".
		event = null,
		seedStart = null,
		seedEnd = null,
		seedAllDay = false,
		seedTitle = '',
		seedDescription = '',
		onSaved
	}: {
		open?: boolean;
		mode: 'new' | 'edit';
		event?: EventListItem | null;
		seedStart?: Date | null;
		seedEnd?: Date | null;
		seedAllDay?: boolean;
		seedTitle?: string;
		seedDescription?: string;
		// Fired after a successful save so the calendar can revalidate.
		onSaved?: () => void;
	} = $props();

	let title = $state('');
	let description = $state('');
	let anytime = $state(false);
	let startDate = $state('');
	let endDate = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let errorMsg = $state<string | null>(null);

	// Split an ISO instant into the "YYYY-MM-DD" / "HH:mm" the pickers use (browser-local,
	// matching how QuickCreatePopover and the drag machine already read/write event times).
	function splitLocal(iso: string | null): { date: string; time: string } {
		const local = dateTimeLocalValue(iso); // '' when null
		const [date = '', time = ''] = local.split('T');
		return { date, time };
	}

	// (Re)seed the form every time the modal opens, from the edited event or the new-seed.
	$effect(() => {
		if (!open) return;
		errorMsg = null;
		if (mode === 'edit' && event) {
			title = event.title;
			description = event.description ?? '';
			anytime = event.all_day;
			const s = splitLocal(event.start_at);
			const e = splitLocal(event.end_at);
			startDate = s.date;
			startTime = s.time;
			endDate = e.date || s.date;
			endTime = e.time;
		} else {
			title = seedTitle;
			description = seedDescription;
			anytime = seedAllDay;
			const s = splitLocal(seedStart ? seedStart.toISOString() : null);
			const e = splitLocal(seedEnd ? seedEnd.toISOString() : null);
			startDate = s.date;
			startTime = s.time;
			endDate = e.date || s.date;
			endTime = e.time;
		}
	});

	// Add one hour to a "HH:mm" string, capped at 23:59.
	function plusHour(time: string): string {
		const [h, m] = time.split(':').map(Number);
		if (Number.isNaN(h)) return '';
		const total = Math.min(h * 60 + (m || 0) + 60, 23 * 60 + 59);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
	}

	// Picking / changing the start time auto-fills the end an hour later when the end is
	// empty or no longer after the start (Jobber / the Job form's behavior — "later we can
	// customize"). Also mirror the date so a same-day event needs one date pick.
	function onStartTimeChange(v: string) {
		startTime = v;
		if (v && (!endTime || endTime <= v)) endTime = plusHour(v);
	}
	function onStartDateChange(v: string) {
		startDate = v;
		if (!endDate || endDate < v) endDate = v;
	}

	// Resolve the picker fields into the API payload's start/end ISO, or throw a
	// user-facing message. All-day forces a single noon-anchored date with a null end
	// (matches the events schema, which stores no end for all-day blocks).
	function resolveSchedule(): { startIso: string; endIso: string | null } {
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
		const trimmed = title.trim();
		if (!trimmed) {
			errorMsg = 'Add a title.';
			return;
		}

		let startIso: string;
		let endIso: string | null;
		try {
			({ startIso, endIso } = resolveSchedule());
		} catch (err) {
			errorMsg = (err as Error).message;
			return;
		}

		const payload = {
			title: trimmed,
			description: description.trim() || null,
			all_day: anytime,
			start_at: startIso,
			end_at: endIso
		};

		const url = mode === 'edit' && event ? `/api/events/${event.id}` : '/api/events';
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

		let msg = mode === 'edit' ? 'Could not save the event.' : 'Could not create the event.';
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
				<Dialog.Title>{mode === 'edit' ? 'Edit Event' : 'New Event'}</Dialog.Title>
			</div>
			<Dialog.Close class="dialog-content__close" aria-label="Close">
				<i class="ri-close-line" aria-hidden="true"></i>
			</Dialog.Close>
		</div>

		<div class="event-form__body">
			<!-- Title + Description share one bordered group (Jobber ref/event/2). -->
			<div class="event-form__group">
				<div class="event-form__group-field">
					<label class="event-form__mini-label" for="event-title">Title</label>
					<input
						id="event-title"
						class="event-form__input"
						placeholder="Event title"
						bind:value={title}
						maxlength={200}
						oninput={() => (errorMsg = null)}
					/>
				</div>
				<div class="event-form__group-field event-form__group-field--divided">
					<label class="event-form__mini-label" for="event-desc">Description</label>
					<textarea
						id="event-desc"
						class="event-form__textarea"
						placeholder="Add details"
						rows="3"
						bind:value={description}
					></textarea>
				</div>
			</div>

			<h4 class="event-form__section">Schedule</h4>

			<div class="event-form__schedule">
				<div class="event-form__dates">
					<div class="field">
						<p class="field__label">Start date</p>
						<Calendar value={startDate} onValueChange={onStartDateChange} placeholder="Start date" />
					</div>
					{#if !anytime}
						<div class="field">
							<p class="field__label">End date</p>
							<Calendar value={endDate} onValueChange={(v) => (endDate = v)} placeholder="End date" />
						</div>
					{/if}
				</div>

				{#if !anytime}
					<div class="event-form__times">
						<div class="field">
							<p class="field__label">Start time</p>
							<TimePicker value={startTime} onValueChange={onStartTimeChange} placeholder="Start time" />
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
					<Switch id="event-anytime" bind:checked={anytime} />
					<label class="event-form__anytime-label" for="event-anytime">Anytime</label>
				</div>
			</div>

			{#if errorMsg}
				<p class="event-form__error">{errorMsg}</p>
			{/if}
		</div>

		<div class="event-form__foot">
			<button type="button" class="event-form__cancel" onclick={() => (open = false)}>Cancel</button>
			<Button loadingLabel="Saving…" successLabel="Saved" onAction={save}>Save</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
