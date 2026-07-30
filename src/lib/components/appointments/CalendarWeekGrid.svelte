<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { addDays, dayKey, isSameDay } from '$lib/utils/calendar';
	import { formatTimeInOrgTz } from '$lib/utils/formatInOrgTz';
	import { sessionStore } from '$lib/stores/session.svelte';
	import type {
		AppointmentDetail,
		AppointmentListItem,
		AppointmentType,
		CalendarDensity
	} from '$lib/types/appointments';
	import { DENSITY_HOUR_HEIGHT, DENSITY_MIN_BLOCK_PX } from '$lib/stores/calendarDensity.svelte';
	import {
		deriveVisitCardState,
		visitCardStateIcon,
		visitCardStateLabel,
		type VisitCardState
	} from '$lib/appointments/cardState';
	import type { EventListItem } from '$lib/types/events';
	import type { ReminderCalendarItem } from '$lib/types/reminders';
	import { isEventPast } from '$lib/appointments/eventState';
	import { reminderDisplayStatus, REMINDER_DISPLAY_LABEL } from '$lib/jobs/billing';
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { eventsStore } from '$lib/stores/events.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import QuickCreatePopover from './QuickCreatePopover.svelte';
	import CardDetailPopover from './CardDetailPopover.svelte';
	import EventDetailPopover from './EventDetailPopover.svelte';
	import ReminderDetailController from './ReminderDetailController.svelte';
	import NotifyDialog from '$lib/components/shared/NotifyDialog.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';

	let {
		anchor,
		items,
		events = [],
		reminders = [],
		canInvoice = false,
		dayStartHour,
		dayEndHour,
		canCreate,
		canReschedule = false,
		assignees = [],
		canEditAssignee = false,
		density = 'comfortable',
		columnMode = 'week',
		columnMembers = [],
		onCreated
	}: {
		anchor: Date;
		items: AppointmentListItem[];
		// Non-billable calendar Events (Jobber `Event`) — rendered as neutral grey
		// blocks alongside visits; draggable/resizable to reschedule (saves instantly,
		// no customer notify) when the viewer has the reschedule permission.
		events?: EventListItem[];
		// Invoice reminders (Jobber INVOICE_REMINDER) — read-only amber to-do blocks. Never
		// draggable: a reminder is a nudge, not reschedulable work. Click → detail popover.
		reminders?: ReminderCalendarItem[];
		// can_create_invoices — gates the reminder popover's actions.
		canInvoice?: boolean;
		dayStartHour: number;
		dayEndHour: number;
		canCreate: boolean;
		canReschedule?: boolean;
		assignees?: { id: string; full_name: string }[];
		canEditAssignee?: boolean;
		// Time-grid zoom: compact / comfortable / spacious (see DENSITY_HOUR_HEIGHT).
		// Drives row height + card content thresholds.
		density?: CalendarDensity;
		// Column axis mode. 'week' (default) = 7 date columns. 'day' = one column per
		// team member on `anchor`'s single day (Jobber dispatch grid) — dragging a card
		// into another member's column reassigns the visit's crew.
		columnMode?: 'week' | 'day';
		// Day-view team members, in display order (one column each). Ignored in week mode.
		columnMembers?: { id: string; name: string }[];
		// Fired after an inline quick-create so the page can revalidate the window.
		onCreated?: () => void;
	} = $props();

	const orgTz = $derived(sessionStore.data?.org.timezone);
	const orgName = $derived(sessionStore.data?.org.name ?? '');

	// Default customer-facing reschedule-confirmation copy — mirrors the org's
	// appointment_confirmation_* templates (orgProvisioning defaults). Shown ONLY as
	// a read-only preview so the contractor sees roughly what the customer will get.
	// The real send always uses the org's own (possibly customized) template plus a
	// server-signed manage link, neither of which is reproducible client-side.
	const RESCHEDULE_SMS_TEMPLATE =
		"Hi {contact_name}, your {appointment_type} with {org_name} is confirmed for {appointment_datetime}. We'll text a reminder before. Need to change it? {manage_link}";
	const RESCHEDULE_EMAIL_SUBJECT = 'Your appointment with {org_name} is confirmed';
	const RESCHEDULE_EMAIL_BODY =
		'Hi {contact_name},\n\nYour {appointment_type} with {org_name} is confirmed for {appointment_datetime}.\n\nNeed to reschedule or cancel? {manage_link}\n\nThanks,\n{org_name}';

	// Per-reschedule copy the contractor can edit before sending (mirrors Quotes/Invoices).
	// Only the fields they actually change ride to the server; untouched fields fall back to
	// the org's saved appointment template server-side.
	type NotifyEdited = { sms: string | null; subject: string | null; body: string | null };
	const RESCHEDULE_MERGE_FIELDS = [
		{ token: 'contact_name', label: 'Contact name' },
		{ token: 'appointment_type', label: 'Appointment type' },
		{ token: 'appointment_datetime', label: 'Date & time' },
		{ token: 'org_name', label: 'Business name' },
		{ token: 'manage_link', label: 'Manage link' }
	];
	// Representative signed manage-link length for an honest SMS segment estimate. The real
	// link is injected server-side at send time via the {manage_link} token.
	const RESCHEDULE_LINK_FOR_COUNT = 'https://yourapp.com/book/manage/' + 'x'.repeat(40);

	// Row height follows the chosen density (compact/comfortable/spacious). The
	// whole grid derives its geometry from HOUR_HEIGHT, so changing it re-renders.
	const HOUR_HEIGHT = $derived(DENSITY_HOUR_HEIGHT[density] ?? 56); // px
	// Which rows a card shows is NOT decided here — the card measures itself in CSS
	// (@container) and switches between named layouts, so the tiers can never drift
	// out of step with the type scale. See `.cal-week__event` in _appointments.scss.
	//
	// The one thing CSS can't do is reserve the space: a 15-min visit is ~18px, too
	// short for even one line. So the grid draws short visits taller than their true
	// duration (DENSITY_MIN_BLOCK_PX) — and, critically, does that inflation HERE, in
	// the same minutes the column packer reasons about. Inflating only at paint time
	// would let two back-to-back 10-min visits (which don't overlap in time, so they
	// share a column) paint straight through each other.
	const MIN_BLOCK_MIN = $derived(((DENSITY_MIN_BLOCK_PX[density] ?? 30) / HOUR_HEIGHT) * 60);
	const TOP_GUTTER = 10; // px — breathing room so the first hour label clears the sticky day-header
	const DEFAULT_DURATION_MIN = 60;
	const SNAP_MINUTES = 15;
	const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
	// Day-view single-day title, e.g. "Tue 21" (Jobber's day header).
	const dayTitleFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric' });

	// member id → display name, for day-view column headers + reassign labels.
	const memberNameById = $derived(new Map(columnMembers.map((m) => [m.id, m.name])));

	// Extract { hour, minute } in the org's timezone so an event scheduled at 9am
	// org-time renders at the 9am grid line regardless of the user's browser tz.
	function partsInOrgTz(d: Date, tz: string | undefined): { hour: number; minute: number } {
		try {
			const fmt = new Intl.DateTimeFormat('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone: tz || undefined
			});
			const parts = fmt.formatToParts(d);
			const h = Number(parts.find((p) => p.type === 'hour')?.value ?? d.getHours());
			const m = Number(parts.find((p) => p.type === 'minute')?.value ?? d.getMinutes());
			return { hour: h === 24 ? 0 : h, minute: m };
		} catch {
			return { hour: d.getHours(), minute: d.getMinutes() };
		}
	}

	function tzDateKey(d: Date, tz: string | undefined): string {
		try {
			const fmt = new Intl.DateTimeFormat('en-CA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				timeZone: tz || undefined
			});
			return fmt.format(d);
		} catch {
			return dayKey(d);
		}
	}

	const today = new Date();

	// A calendar block is a visit (colored), a non-billable Event (neutral grey), or an
	// invoice reminder (amber, read-only). Visits + Events drag to reschedule; reminders never
	// do — but all three share the grid, so they lay out in the same columns.
	type CalBlock =
		| { kind: 'appt'; appt: AppointmentListItem }
		| { kind: 'event'; event: EventListItem }
		| { kind: 'reminder'; reminder: ReminderCalendarItem };

	// Stable key for an #each over CalBlocks (id namespaced isn't needed — ids are uuids).
	function blockId(b: CalBlock): string {
		return b.kind === 'appt' ? b.appt.id : b.kind === 'event' ? b.event.id : b.reminder.id;
	}

	// The shared reminder popover (opened by a reminder click; deep-links create/edit to the
	// job, runs complete/delete inline).
	let reminderCtl: ReminderDetailController;

	// Which Anytime columns are expanded. By default the lane shows only the FIRST card per
	// column + a "View more" button, so a busy day doesn't push the whole lane tall (Jobber
	// keeps the all-day row compact). Keyed by column key; a click toggles that column open.
	const expandedAnytime = new SvelteSet<string>();
	function toggleAnytime(key: string) {
		if (expandedAnytime.has(key)) expandedAnytime.delete(key);
		else expandedAnytime.add(key);
	}
	// How many cards to show when a column is collapsed.
	const ANYTIME_COLLAPSED = 1;

	type LaidOut = {
		block: CalBlock;
		startMin: number;
		// The visit's REAL end — drives its duration on drag, its resize anchor, and
		// the time it prints. Never use paintEndMin for any of those.
		endMin: number;
		// The end of the DRAWN box: endMin, or far enough down to fit one readable
		// line, whichever is later. Column packing uses this too, so an inflated card
		// is given room instead of overlapping the next one.
		paintEndMin: number;
		col: number;
		cols: number;
	};

	// The grid reasons about COLUMNS, never "days" directly, so the week view (7 date
	// columns) and the day view (one column per team member on a single day) share one
	// drag/reschedule engine. A column carries the calendar day it represents plus an
	// optional crew scope:
	//   • memberId === null  → not crew-scoped (week view): a block belongs to the column
	//     purely by matching the day.
	//   • memberId === a member id (or UNASSIGNED_COL) → crew-scoped (day view): a block
	//     also has to belong to that member, and a cross-column drop REASSIGNS it.
	type GridColumn = {
		key: string;
		date: Date;
		memberId: string | null;
		laidOut: LaidOut[];
		// "Anytime"/all-day items for this column — rendered in the top lane, not a time row.
		anytime: CalBlock[];
	};

	// Sentinel memberId for the "Unassigned" day-view column (visits with no crew).
	const UNASSIGNED_COL = '__unassigned__';

	// Packs a day's blocks into side-by-side columns. Overlap is judged on
	// `paintEndMin` (the drawn box), not the real end, so a card inflated to the
	// one-line minimum claims its painted space and neighbours step aside.
	function layoutDay(
		dayItems: { block: CalBlock; startMin: number; endMin: number; paintEndMin: number }[]
	): LaidOut[] {
		const sorted = [...dayItems].sort(
			(a, b) => a.startMin - b.startMin || a.paintEndMin - b.paintEndMin
		);
		const colEnds: number[] = [];
		const assigned: LaidOut[] = [];
		for (const ev of sorted) {
			let col = colEnds.findIndex((end) => end <= ev.startMin);
			if (col === -1) {
				col = colEnds.length;
				colEnds.push(ev.paintEndMin);
			} else {
				colEnds[col] = ev.paintEndMin;
			}
			assigned.push({
				block: ev.block,
				startMin: ev.startMin,
				endMin: ev.endMin,
				paintEndMin: ev.paintEndMin,
				col,
				cols: 1
			});
		}
		// Cluster pass: connected components of overlap.
		let i = 0;
		while (i < assigned.length) {
			let j = i;
			let clusterEnd = assigned[i].paintEndMin;
			let maxCol = assigned[i].col;
			while (j + 1 < assigned.length && assigned[j + 1].startMin < clusterEnd) {
				j++;
				clusterEnd = Math.max(clusterEnd, assigned[j].paintEndMin);
				maxCol = Math.max(maxCol, assigned[j].col);
			}
			const size = maxCol + 1;
			for (let k = i; k <= j; k++) assigned[k].cols = size;
			i = j + 1;
		}
		return assigned;
	}

	// The ordered column axis, with a precomputed org-tz date key per column for fast
	// bucketing. Week view (current + default): 7 day columns, no crew scope. The day
	// view will feed member columns here in a later step — the rest of the engine is
	// already column-based, so only this list changes.
	const columnDefs = $derived.by<
		{ key: string; date: Date; memberId: string | null; tzKey: string }[]
	>(() => {
		const out: { key: string; date: Date; memberId: string | null; tzKey: string }[] = [];

		// Day view: one crew-scoped column per team member on `anchor`'s single day.
		// An extra "Unassigned" column appears only when a visible visit/event that day
		// has no crew (so unassigned work is never invisible), and always as a fallback
		// when there are no members to show at all.
		if (columnMode === 'day') {
			const d = anchor;
			const tzKey = tzDateKey(d, orgTz);
			let hasUnassigned = false;
			for (const it of items) {
				if (it.assigned_to === null && tzDateKey(new Date(it.scheduled_start), orgTz) === tzKey) {
					hasUnassigned = true;
					break;
				}
			}
			if (!hasUnassigned) {
				for (const ev of events) {
					if (
						ev.assigned_to === null &&
						ev.start_at &&
						tzDateKey(new Date(ev.start_at), orgTz) === tzKey
					) {
						hasUnassigned = true;
						break;
					}
				}
			}
			if (!hasUnassigned) {
				for (const rem of reminders) {
					if (
						rem.assigned_to === null &&
						rem.scheduled_start &&
						tzDateKey(new Date(rem.scheduled_start), orgTz) === tzKey
					) {
						hasUnassigned = true;
						break;
					}
				}
			}
			for (const m of columnMembers) {
				out.push({ key: `m:${m.id}`, date: d, memberId: m.id, tzKey });
			}
			if (hasUnassigned || columnMembers.length === 0) {
				out.push({ key: `m:${UNASSIGNED_COL}`, date: d, memberId: UNASSIGNED_COL, tzKey });
			}
			return out;
		}

		// Week view (default): 7 date columns, no crew scope.
		for (let i = 0; i < 7; i++) {
			const d = addDays(anchor, i);
			out.push({ key: dayKey(d), date: d, memberId: null, tzKey: tzDateKey(d, orgTz) });
		}
		return out;
	});

	// Does a block belong in this column? The day must match always; the crew must
	// match only when the column is crew-scoped (day view). A null-crew column (week)
	// accepts any assignee, so the day match alone decides.
	function columnAccepts(
		col: { memberId: string | null; tzKey: string },
		itemTzKey: string,
		itemAssignedTo: string | null
	): boolean {
		if (col.tzKey !== itemTzKey) return false;
		if (col.memberId === null) return true;
		if (col.memberId === UNASSIGNED_COL) return itemAssignedTo === null;
		return col.memberId === itemAssignedTo;
	}

	// Timed start/end minute-of-day for a block, expanding a missing/invalid end to a
	// default duration so it always has drawable height.
	function timedMinutes(
		startIso: string,
		endIso: string | null
	): { startMin: number; endMin: number } {
		const start = new Date(startIso);
		const { hour: sh, minute: sm } = partsInOrgTz(start, orgTz);
		const startMin = sh * 60 + sm;
		let endMin: number;
		if (endIso) {
			const { hour: eh, minute: em } = partsInOrgTz(new Date(endIso), orgTz);
			endMin = eh * 60 + em;
			if (endMin <= startMin) endMin = startMin + DEFAULT_DURATION_MIN;
		} else {
			endMin = startMin + DEFAULT_DURATION_MIN;
		}
		return { startMin, endMin };
	}

	const columns = $derived.by<GridColumn[]>(() => {
		const defs = columnDefs;
		// Bucket by column INDEX (not a day-key string): in day view several columns share
		// the same day, so the member dimension is what tells them apart.
		const timed: { block: CalBlock; startMin: number; endMin: number; paintEndMin: number }[][] =
			defs.map(() => []);
		const anytime: CalBlock[][] = defs.map(() => []);

		for (const item of items) {
			const itemTzKey = tzDateKey(new Date(item.scheduled_start), orgTz);
			const ci = defs.findIndex((c) => columnAccepts(c, itemTzKey, item.assigned_to));
			if (ci < 0) continue;

			// "Anytime" visits have no clock time — they live in the top lane, not a time row.
			if (item.all_day) {
				anytime[ci].push({ kind: 'appt', appt: item });
				continue;
			}
			const { startMin, endMin } = timedMinutes(item.scheduled_start, item.scheduled_end);
			timed[ci].push({
				block: { kind: 'appt', appt: item },
				startMin,
				endMin,
				paintEndMin: Math.max(endMin, startMin + MIN_BLOCK_MIN)
			});
		}
		// Events share the grid: all-day → anytime lane, timed → a neutral block. In day
		// view they land in their own assignee's column (same crew match as visits).
		for (const ev of events) {
			if (!ev.start_at) continue; // unscheduled event — not on the grid
			const evTzKey = tzDateKey(new Date(ev.start_at), orgTz);
			const ci = defs.findIndex((c) => columnAccepts(c, evTzKey, ev.assigned_to));
			if (ci < 0) continue;
			if (ev.all_day) {
				anytime[ci].push({ kind: 'event', event: ev });
				continue;
			}
			const { startMin, endMin } = timedMinutes(ev.start_at, ev.end_at);
			timed[ci].push({
				block: { kind: 'event', event: ev },
				startMin,
				endMin,
				paintEndMin: Math.max(endMin, startMin + MIN_BLOCK_MIN)
			});
		}
		// Reminders share the grid too: all-day → anytime lane, timed → an amber block. In day
		// view they land in their assignee's column (same crew match as visits/events).
		for (const rem of reminders) {
			if (!rem.scheduled_start) continue; // schedule-later reminder — not on the grid
			const rTzKey = tzDateKey(new Date(rem.scheduled_start), orgTz);
			const ci = defs.findIndex((c) => columnAccepts(c, rTzKey, rem.assigned_to));
			if (ci < 0) continue;
			if (rem.all_day) {
				anytime[ci].push({ kind: 'reminder', reminder: rem });
				continue;
			}
			const { startMin, endMin } = timedMinutes(rem.scheduled_start, rem.scheduled_end);
			timed[ci].push({
				block: { kind: 'reminder', reminder: rem },
				startMin,
				endMin,
				paintEndMin: Math.max(endMin, startMin + MIN_BLOCK_MIN)
			});
		}
		return defs.map((c, i) => ({
			key: c.key,
			date: c.date,
			memberId: c.memberId,
			laidOut: layoutDay(timed[i]),
			anytime: anytime[i]
		}));
	});

	// The grid always renders the full 24 hours (Jobber / Google Calendar): hours
	// outside the org's business window are shaded but still there, so an early
	// start or an after-hours callout can be seen and drag-created like any other.
	// The view simply *opens* parked at the org's start hour — see the scroll effect.
	const range = { startMin: 0, endMin: 24 * 60, hours: 24, startHour: 0 };

	const hourLabels = $derived.by(() => {
		const out: { hour: number; label: string; isOffHours: boolean }[] = [];
		for (let h = range.startHour; h < range.startHour + range.hours; h++) {
			const isOff = h < dayStartHour || h >= dayEndHour;
			const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
			out.push({ hour: h, label, isOffHours: isOff });
		}
		return out;
	});

	function pxFromMin(min: number): number {
		return ((min - range.startMin) / 60) * HOUR_HEIGHT + TOP_GUTTER;
	}

	// ── Open at business hours ──────────────────────────────────────────────
	// The grid renders every hour an item touches (an early-morning visit can push
	// range.startHour to 5 AM), but the contractor's working day is what they came
	// to look at — so park the org's start hour at the top of the viewport, like
	// Jobber/Google Calendar. Earlier hours stay one scroll up.
	let scrollerEl = $state<HTMLDivElement | null>(null);
	// Set the moment the user scrolls themselves; from then on we never yank the
	// viewport back, even if late-arriving items change the visible hour range.
	let userScrolled = false;

	$effect(() => {
		// Read reactively first: re-aligns when the row height changes (density), for
		// as long as the user hasn't scrolled themselves.
		const y = Math.max(0, pxFromMin(dayStartHour * 60) - TOP_GUTTER);
		if (!scrollerEl || userScrolled) return;
		scrollerEl.scrollTop = y;
	});

	// Any real scroll gesture hands the viewport back to the user for good.
	$effect(() => {
		const el = scrollerEl;
		if (!el) return;
		const mark = () => (userScrolled = true);
		el.addEventListener('wheel', mark, { passive: true });
		el.addEventListener('touchmove', mark, { passive: true });
		return () => {
			el.removeEventListener('wheel', mark);
			el.removeEventListener('touchmove', mark);
		};
	});

	// Live "now" line — ticks every minute.
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(id);
	});

	const nowParts = $derived(partsInOrgTz(now, orgTz));
	const nowMin = $derived(nowParts.hour * 60 + nowParts.minute);
	const nowVisible = $derived(nowMin >= range.startMin && nowMin <= range.endMin);
	// The current time as a gutter pill (e.g. "9:30 AM"), shown only when the visible
	// week actually contains today — otherwise "now" has no row to sit on.
	const gridHasToday = $derived(columns.some((c) => isSameDay(c.date, today)));
	const nowLabel = $derived(formatTimeInOrgTz(now, orgTz));

	// ── Coordinate / time helpers ───────────────────────────────────────────
	const DRAG_THRESHOLD = 4; // px before a pointerdown becomes a drag

	let gridBodyEl = $state<HTMLDivElement | null>(null);
	// Measured heights of the two pinned lanes — they drive the sticky offsets of
	// whatever pins beneath them (Anytime lane under the header, business-hours
	// caption under both).
	let headH = $state(0);
	let anytimeH = $state(0);
	// Day view only: measured height of the "Tue 21" title bar, so the sticky member
	// header + Anytime lane pin directly beneath it. 0 (and unrendered) in week view.
	let titleH = $state(0);
	// The pinned "Anytime" lane, used to hit-test whether a drag is over it
	// (Google Calendar / Jobber all-day row). Drop here → visit becomes untimed.
	let anytimeEl = $state<HTMLDivElement | null>(null);
	// Which zone the current move-drag is hovering. 'anytime' hides the time ghost
	// and, on drop, converts the visit to a date-only (all_day) appointment.
	let dropZone = $state<'grid' | 'anytime'>('grid');

	// Is a viewport Y inside the pinned Anytime lane? (Column comes from colFromPoint.)
	function pointZone(clientY: number): 'grid' | 'anytime' {
		if (anytimeEl) {
			const r = anytimeEl.getBoundingClientRect();
			if (clientY >= r.top && clientY <= r.bottom) return 'anytime';
		}
		return 'grid';
	}

	function clampDayMin(min: number): number {
		return Math.max(0, Math.min(24 * 60, min));
	}

	function snapMin(min: number): number {
		return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
	}

	// Convert a viewport Y into a minute-of-day on the visible grid (inverts
	// pxFromMin, accounting for TOP_GUTTER and the scroll position via getBoundingClientRect).
	function minFromClientY(clientY: number): number {
		if (!gridBodyEl) return range.startMin;
		const rect = gridBodyEl.getBoundingClientRect();
		const y = clientY - rect.top - TOP_GUTTER;
		return range.startMin + (y / HOUR_HEIGHT) * 60;
	}

	// Which day column is under the pointer (cross-column move). -1 if none.
	function colFromPoint(clientX: number, clientY: number): number {
		const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
		const col = el?.closest('[data-col-index]') as HTMLElement | null;
		if (!col) return -1;
		return Number(col.getAttribute('data-col-index'));
	}

	function labelForMin(min: number): string {
		const h = Math.floor(min / 60) % 24;
		const m = ((min % 60) + 60) % 60;
		const ampm = h < 12 ? 'AM' : 'PM';
		const h12 = h % 12 === 0 ? 12 : h % 12;
		return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	// Offset (ms) of an IANA tz at a given UTC instant.
	function tzOffsetMs(utcMs: number, tz: string): number {
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		const m: Record<string, number> = {};
		for (const p of dtf.formatToParts(new Date(utcMs))) {
			if (p.type !== 'literal') m[p.type] = Number(p.value);
		}
		const h = m.hour === 24 ? 0 : m.hour;
		const asUtc = Date.UTC(m.year, m.month - 1, m.day, h, m.minute, m.second);
		return asUtc - utcMs;
	}

	// Build the absolute instant for a wall-clock time on the org-tz calendar day
	// that `day`'s column represents. Used by reschedule so a block dropped on
	// "9 AM Tue" saves as 9 AM org-time (DST-correct), matching how the grid buckets.
	function wallClockToUtc(day: Date, totalMin: number, tz: string | undefined): Date {
		const hour = Math.floor(totalMin / 60);
		const minute = totalMin % 60;
		let y: number;
		let mo: number;
		let d: number;
		if (tz) {
			const [yy, mm, dd] = tzDateKey(day, tz).split('-').map(Number);
			y = yy;
			mo = mm - 1;
			d = dd;
		} else {
			y = day.getFullYear();
			mo = day.getMonth();
			d = day.getDate();
		}
		const guess = Date.UTC(y, mo, d, hour, minute, 0, 0);
		const off1 = tzOffsetMs(guess, tz ?? 'UTC');
		if (!tz) return new Date(y, mo, d, hour, minute, 0, 0);
		let result = guess - off1;
		const off2 = tzOffsetMs(result, tz);
		if (off2 !== off1) result = guess - off2;
		return new Date(result);
	}

	// ── Drag state machine ──────────────────────────────────────────────────
	type DragState = {
		mode: 'create' | 'move' | 'resize';
		pointerId: number;
		startClientX: number;
		startClientY: number;
		moved: boolean;
		colIndex: number;
		ghostStartMin: number;
		ghostEndMin: number;
		anchorMin?: number; // create: where the drag began
		item?: AppointmentListItem; // move / resize — a visit
		eventItem?: EventListItem; // move / resize — a non-billable Event (mutually exclusive with item)
		durationMin?: number; // move
		grabOffsetMin?: number; // move: where in the block the user grabbed
		origStartMin?: number; // resize: fixed start
	};

	let drag = $state<DragState | null>(null);
	let justDragged = false; // suppress the click that follows a moved event drag

	let popover = $state<{ x: number; y: number; start: Date; end: Date; allDay: boolean } | null>(
		null
	);

	// Tentative "being created" block — kept painted behind the quick-create bubble
	// so the drawn slot never appears to vanish on release (Google Calendar style).
	let pendingCreate = $state<{ colIndex: number; startMin: number; endMin: number } | null>(null);

	// Click-a-card detail popover (Jobber's visit preview): opens beside the clicked
	// block with the essentials + quick actions, instead of navigating straight to the
	// full detail page. `anchorEl` is the clicked card element (Popover customAnchor).
	// We keep only the id + anchor (plus a snapshot fallback) and read the LIVE row from
	// the store — so a status/schedule change patched into the store re-renders the open
	// popover instantly, instead of the popover showing a frozen copy from open-time.
	let detailPopover = $state<{
		id: string;
		snapshot: AppointmentListItem;
		anchorEl: HTMLElement;
	} | null>(null);

	// The live row for the open popover: the store's current copy (reactive) if the row
	// is still in the loaded list, else the open-time snapshot (e.g. it was filtered out).
	const detailItem = $derived(
		detailPopover
			? (appointmentsStore.items.find((i) => i.id === detailPopover!.id) ?? detailPopover.snapshot)
			: null
	);

	function openDetail(e: MouseEvent, item: AppointmentListItem) {
		e.stopPropagation();
		e.preventDefault();
		if (justDragged) return; // a drag just ended — that's not a card-open click
		popover = null; // Jobber-style: only one popup at a time — close the create popup
		pendingCreate = null;
		eventDetailPopover = null;
		detailPopover = { id: item.id, snapshot: item, anchorEl: e.currentTarget as HTMLElement };
	}

	// Click-an-Event popover (Jobber ref/event/4) — mirrors the visit `detailPopover`
	// but for a non-billable Event: keeps only the id + anchor and reads the LIVE row
	// from the events store, so an inline edit re-renders it without a reopen.
	let eventDetailPopover = $state<{
		id: string;
		snapshot: EventListItem;
		anchorEl: HTMLElement;
	} | null>(null);

	const eventDetailItem = $derived(
		eventDetailPopover
			? (eventsStore.items.find((e) => e.id === eventDetailPopover!.id) ??
					eventDetailPopover.snapshot)
			: null
	);

	function openEventDetail(e: MouseEvent, evt: EventListItem) {
		e.stopPropagation();
		e.preventDefault();
		if (justDragged) return; // a drag just ended — that's not a card-open click
		popover = null; // only one popup at a time
		pendingCreate = null;
		detailPopover = null;
		eventDetailPopover = { id: evt.id, snapshot: evt, anchorEl: e.currentTarget as HTMLElement };
	}

	type NotifyChannel = 'sms' | 'email' | 'both' | 'none';

	// A committed-optimistically reschedule awaiting confirmation. The move is already
	// applied to the UI; the confirm popup decides whether to keep it. Visits (`appt`)
	// then offer a client-notify step; Events (`event`) just save (no customer).
	// A crew reassignment staged alongside a move (day view only). `undefined` = no
	// crew change (week view, or dropped back on the same member); a member id assigns
	// that person as sole crew; `null` unassigns (dropped on the Unassigned column).
	// `name` is the display label for the confirm dialog (null when unassigning).
	type Reassign = { to: string | null; name: string | null } | undefined;

	type ApptMove = {
		kind: 'appt';
		item: AppointmentListItem;
		startIso: string;
		endIso: string | null;
		allDay: boolean;
		reassign: Reassign;
		prev: ReturnType<typeof appointmentsStore.optimisticUpdate>;
		datetimeLabel: string;
	};
	type EventMove = {
		kind: 'event';
		event: EventListItem;
		startIso: string;
		endIso: string | null;
		allDay: boolean;
		reassign: Reassign;
		prev: ReturnType<typeof eventsStore.optimisticUpdate>;
		datetimeLabel: string;
	};
	type PendingMove = ApptMove | EventMove;
	let pendingMove = $state<PendingMove | null>(null);
	// Step 1 of the drag flow: a confirmation popup ("Move to {time}?"). Cancel snaps
	// the card back; Save persists the move (spinner) then hands off to the notify popup.
	let confirmRescheduleOpen = $state(false);
	let rescheduleSaving = $state(false);
	// Set true the moment Save is chosen so the dialog's own close→onCancel doesn't
	// mistake the confirm for a dismiss and revert the (already-saved) move.
	let rescheduleDecided = false;
	let notifyOpen = $state(false);
	// pendingMove's lifecycle is owned entirely by the explicit handlers below
	// (cancel / save / notify). Deliberately NO reactive $effect clears it: an effect
	// racing the dialog's onCancel callback could null pendingMove first, so Cancel
	// would read null and skip the revert — leaving the card stuck in the dragged slot.

	function formatDateTimeInOrgTz(iso: string, allDay: boolean): string {
		try {
			return new Intl.DateTimeFormat('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				...(allDay ? {} : { hour: 'numeric', minute: '2-digit' }),
				timeZone: orgTz || undefined
			}).format(new Date(iso));
		} catch {
			return new Date(iso).toLocaleString();
		}
	}

	function firstName(full: string): string {
		return full.trim().split(/\s+/)[0] || full;
	}

	// Day-view reassignment clause for the confirm dialog (empty in week view / no crew change).
	function reassignSuffix(m: PendingMove): string {
		if (!m.reassign) return '';
		return m.reassign.to
			? ` and reassign to ${m.reassign.name ?? 'this member'}`
			: ' and unassign the crew';
	}

	// Fill the reschedule preview tokens with this appointment's real values. The
	// manage link is a server-signed token we can't reproduce, so it renders as the
	// display text NotifyDialog passes in.
	function fillReschedule(template: string, link: string): string {
		const m = pendingMove;
		if (!m || m.kind !== 'appt') return template;
		const loc = m.item.location ?? '';
		return template
			.replaceAll('{contact_name}', firstName(m.item.contact_name))
			.replaceAll('{appointment_type}', m.item.type.replaceAll('_', ' '))
			.replaceAll('{org_name}', orgName)
			.replaceAll('{appointment_datetime}', m.datetimeLabel)
			.replaceAll('{location}', loc)
			.replaceAll('{location_block}', loc ? `Where: ${loc}\n\n` : '')
			.replaceAll('{manage_link}', link);
	}

	function addDragListeners() {
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerCancel);
	}
	function removeDragListeners() {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerCancel);
	}

	// Capture the pointer on the element the drag started from so every
	// subsequent move/up is delivered here even when the cursor passes over
	// other elements — and so the browser can't start a competing native
	// gesture (e.g. link drag) that would swallow our pointerup.
	function capturePointer(e: PointerEvent) {
		try {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		} catch {
			// no-op: pointer capture is best-effort
		}
	}

	$effect(() => () => removeDragListeners());

	function onColumnPointerDown(e: PointerEvent, colIndex: number) {
		if (!canCreate || e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('a') || target.closest('[data-resize]')) return;
		e.preventDefault();
		capturePointer(e);
		const startMin = snapMin(clampDayMin(minFromClientY(e.clientY)));
		drag = {
			mode: 'create',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			anchorMin: startMin,
			ghostStartMin: startMin,
			ghostEndMin: startMin + DEFAULT_DURATION_MIN
		};
		dropZone = 'grid';
		addDragListeners();
	}

	// Click an empty spot in the Anytime lane → create a date-only visit for that day.
	function onAnytimeColumnClick(e: MouseEvent, colIndex: number) {
		if (!canCreate || justDragged) return;
		// Clicks on an existing card/chip are its own navigation / drag — ignore here.
		// (Anytime visits now render as `.cal-week__event--anytime`; Events stay chips.)
		if ((e.target as HTMLElement).closest('.cal-week__event--anytime, .cal-week__anytime-chip'))
			return;
		const date = columns[colIndex]?.date;
		if (!date) return;
		// Browser-local noon — the /new form reinterprets the date part (matches create).
		const start = new Date(date);
		start.setHours(12, 0, 0, 0);
		detailPopover = null; // Jobber-style: only one popup at a time — close the detail popup
		popover = { x: e.clientX, y: e.clientY, start, end: start, allDay: true };
	}

	// Drag an Anytime chip out of the lane. Reuses the move machine; the drop zone
	// (grid vs lane) at pointerup decides whether it gains a time or stays untimed.
	function onAnytimeChipPointerDown(e: PointerEvent, item: AppointmentListItem, colIndex: number) {
		if (!canReschedule || e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		capturePointer(e);
		drag = {
			mode: 'move',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			item,
			durationMin: DEFAULT_DURATION_MIN,
			grabOffsetMin: 0,
			ghostStartMin: dayStartHour * 60,
			ghostEndMin: dayStartHour * 60 + DEFAULT_DURATION_MIN
		};
		dropZone = 'anytime';
		addDragListeners();
	}

	// Only visits drag — the caller passes the appointment (events are read-only).
	function onEventPointerDown(
		e: PointerEvent,
		ev: LaidOut,
		appt: AppointmentListItem,
		colIndex: number
	) {
		if (!canReschedule || e.button !== 0) return;
		// Don't start a move from the resize handle.
		if ((e.target as HTMLElement).closest('[data-resize]')) return;
		e.stopPropagation();
		// Suppress the browser's native link-drag on the <a> card; otherwise it
		// hijacks the gesture, hides the card behind a link ghost, and eats our
		// pointerup so the drag state never resets.
		e.preventDefault();
		capturePointer(e);
		drag = {
			mode: 'move',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			item: appt,
			durationMin: ev.endMin - ev.startMin,
			grabOffsetMin: minFromClientY(e.clientY) - ev.startMin,
			ghostStartMin: ev.startMin,
			ghostEndMin: ev.endMin
		};
		dropZone = 'grid';
		addDragListeners();
	}

	function onResizePointerDown(
		e: PointerEvent,
		ev: LaidOut,
		appt: AppointmentListItem,
		colIndex: number
	) {
		if (!canReschedule || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		capturePointer(e);
		drag = {
			mode: 'resize',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			item: appt,
			origStartMin: ev.startMin,
			ghostStartMin: ev.startMin,
			ghostEndMin: ev.endMin
		};
		dropZone = 'grid';
		addDragListeners();
	}

	// Drag a non-billable Event block (grey time-block). Mirrors onEventPointerDown
	// (the visit mover) but stashes the Event on `eventItem` so the drop routes to the
	// event-only save path (no customer notify). The div isn't an <a>, so we stop
	// propagation to keep the column's create-drag from also firing.
	function onTimeblockPointerDown(
		e: PointerEvent,
		ev: LaidOut,
		evt: EventListItem,
		colIndex: number
	) {
		if (!canReschedule || e.button !== 0) return;
		if ((e.target as HTMLElement).closest('[data-resize]')) return;
		e.stopPropagation();
		e.preventDefault();
		capturePointer(e);
		drag = {
			mode: 'move',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			eventItem: evt,
			durationMin: ev.endMin - ev.startMin,
			grabOffsetMin: minFromClientY(e.clientY) - ev.startMin,
			ghostStartMin: ev.startMin,
			ghostEndMin: ev.endMin
		};
		dropZone = 'grid';
		addDragListeners();
	}

	function onTimeblockResizePointerDown(
		e: PointerEvent,
		ev: LaidOut,
		evt: EventListItem,
		colIndex: number
	) {
		if (!canReschedule || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		capturePointer(e);
		drag = {
			mode: 'resize',
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			moved: false,
			colIndex,
			eventItem: evt,
			origStartMin: ev.startMin,
			ghostStartMin: ev.startMin,
			ghostEndMin: ev.endMin
		};
		dropZone = 'grid';
		addDragListeners();
	}

	function onPointerMove(e: PointerEvent) {
		const d = drag;
		if (!d) return;
		if (!d.moved) {
			if (Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_THRESHOLD)
				return;
			d.moved = true;
		}

		if (d.mode === 'create') {
			const cur = snapMin(clampDayMin(minFromClientY(e.clientY)));
			const anchor = d.anchorMin ?? cur;
			d.ghostStartMin = Math.min(anchor, cur);
			d.ghostEndMin = Math.max(anchor, cur);
			if (d.ghostEndMin - d.ghostStartMin < SNAP_MINUTES)
				d.ghostEndMin = d.ghostStartMin + SNAP_MINUTES;
		} else if (d.mode === 'move') {
			const col = colFromPoint(e.clientX, e.clientY);
			if (col >= 0) d.colIndex = col;
			dropZone = pointZone(e.clientY);
			// Over the Anytime lane the block has no time — skip the time ghost.
			if (dropZone === 'grid') {
				const dur = d.durationMin ?? DEFAULT_DURATION_MIN;
				let start = snapMin(minFromClientY(e.clientY) - (d.grabOffsetMin ?? 0));
				start = Math.max(0, Math.min(24 * 60 - dur, start));
				d.ghostStartMin = start;
				d.ghostEndMin = start + dur;
			}
		} else {
			const origStart = d.origStartMin ?? 0;
			let end = snapMin(clampDayMin(minFromClientY(e.clientY)));
			if (end < origStart + SNAP_MINUTES) end = origStart + SNAP_MINUTES;
			d.ghostEndMin = end;
		}
	}

	function onPointerUp(e: PointerEvent) {
		const d = drag;
		drag = null;
		removeDragListeners();
		if (!d) return;

		if (d.mode === 'create') {
			const date = columns[d.colIndex]?.date;
			if (!date) return;
			const startMin = d.ghostStartMin;
			const endMin = d.moved ? d.ghostEndMin : startMin + DEFAULT_DURATION_MIN;
			// Browser-local wall-clock — the /new form reinterprets it via its picker
			// (matches the previous click-to-create behaviour exactly).
			const start = new Date(date);
			start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
			const end = new Date(date);
			end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
			// Keep the drawn block visible behind the create bubble until it closes.
			pendingCreate = { colIndex: d.colIndex, startMin, endMin };
			detailPopover = null; // Jobber-style: only one popup at a time — close the detail popup
			popover = { x: e.clientX, y: e.clientY, start, end, allDay: false };
			return;
		}

		// move / resize — only act if the pointer actually moved.
		if (!d.moved) return;
		justDragged = true;
		setTimeout(() => (justDragged = false), 0);
		// A move dropped on the Anytime lane converts to a date-only block; resize never does.
		const zone = d.mode === 'move' ? pointZone(e.clientY) : 'grid';
		// Events save instantly (internal time-block, no customer notify); visits go
		// through the confirm → notify pipeline.
		if (d.eventItem) {
			void applyEventReschedule(d, zone);
			return;
		}
		if (!d.item) return;
		applyReschedule(d, zone);
	}

	// Pointer interrupted (e.g. touch cancelled by the OS). Abandon the drag
	// without committing — the optimistic ghost is discarded with the state.
	function onPointerCancel() {
		drag = null;
		removeDragListeners();
	}

	// On drop: apply the move instantly (optimistic) so the card follows the cursor,
	// then open the confirmation popup (step 1). Cancel snaps the card back; Save
	// persists the move (spinner) and hands off to the notify popup (step 2).
	// Day view only: does dropping in this column change the block's crew? Returns
	// undefined when the column isn't crew-scoped (week) or the crew is unchanged, else
	// the new crew ({to, name}) — `to:null` means the Unassigned column (drop to unassign).
	function reassignForColumn(colIndex: number, currentAssignedTo: string | null): Reassign {
		const col = columns[colIndex];
		if (!col || col.memberId === null) return undefined; // week view — no crew scope
		const to = col.memberId === UNASSIGNED_COL ? null : col.memberId;
		if (to === currentAssignedTo) return undefined; // dropped back on the same member
		return { to, name: to ? (memberNameById.get(to) ?? null) : null };
	}

	function applyReschedule(d: DragState, zone: 'grid' | 'anytime') {
		const item = d.item;
		if (!item) return;
		const date = columns[d.colIndex]?.date;
		if (!date) return;

		let startIso: string;
		let endIso: string | null;
		let allDay: boolean;

		if (zone === 'anytime') {
			// Untimed on this day — anchor at noon org-time so the day bucket is DST-safe.
			startIso = wallClockToUtc(date, 12 * 60, orgTz).toISOString();
			endIso = null;
			allDay = true;
		} else {
			startIso = wallClockToUtc(date, d.ghostStartMin, orgTz).toISOString();
			endIso = wallClockToUtc(date, d.ghostEndMin, orgTz).toISOString();
			allDay = false;
		}

		const reassign = reassignForColumn(d.colIndex, item.assigned_to);

		// No-op guard: same start, same end, same timed/untimed nature, and no crew change
		// → nothing to do. (A pure cross-column drop keeps the same time but reassigns, so
		// the crew check must be part of the guard or it would swallow a reassignment.)
		if (
			!reassign &&
			startIso === item.scheduled_start &&
			(endIso ?? null) === (item.scheduled_end ?? null) &&
			allDay === item.all_day
		)
			return;

		const prev = appointmentsStore.optimisticUpdate(item.id, {
			scheduled_start: startIso,
			scheduled_end: endIso,
			all_day: allDay,
			// Reassign optimistically so the card jumps to the new member's column at once.
			...(reassign
				? {
						assigned_to: reassign.to,
						assignee_name: reassign.name,
						assignee_count: reassign.to ? 1 : 0
					}
				: {})
		});

		// Stage the move and ask for confirmation before touching the server.
		rescheduleDecided = false;
		pendingMove = {
			kind: 'appt',
			item,
			startIso,
			endIso,
			allDay,
			reassign,
			prev,
			datetimeLabel: formatDateTimeInOrgTz(startIso, allDay)
		};
		confirmRescheduleOpen = true;
	}

	// On drop of a non-billable Event: apply the move optimistically, then stage the SAME
	// confirm popup visits use (step 1). Cancel snaps back; Save persists. There's no
	// step-2 notify — an Event has no customer to tell.
	function applyEventReschedule(d: DragState, zone: 'grid' | 'anytime') {
		const ev = d.eventItem;
		if (!ev) return;
		const date = columns[d.colIndex]?.date;
		if (!date) return;

		let startIso: string;
		let endIso: string | null;
		let allDay: boolean;

		if (zone === 'anytime') {
			// Untimed on this day — anchor at noon org-time so the day bucket is DST-safe.
			startIso = wallClockToUtc(date, 12 * 60, orgTz).toISOString();
			endIso = null;
			allDay = true;
		} else {
			startIso = wallClockToUtc(date, d.ghostStartMin, orgTz).toISOString();
			endIso = wallClockToUtc(date, d.ghostEndMin, orgTz).toISOString();
			allDay = false;
		}

		const reassign = reassignForColumn(d.colIndex, ev.assigned_to);

		// No-op guard: same start, same end, same timed/untimed nature, and no crew change.
		if (
			!reassign &&
			startIso === ev.start_at &&
			(endIso ?? null) === (ev.end_at ?? null) &&
			allDay === ev.all_day
		)
			return;

		const prev = eventsStore.optimisticUpdate(ev.id, {
			start_at: startIso,
			end_at: endIso,
			all_day: allDay,
			...(reassign
				? {
						assigned_to: reassign.to,
						assignee_name: reassign.name,
						assignee_count: reassign.to ? 1 : 0
					}
				: {})
		});

		rescheduleDecided = false;
		pendingMove = {
			kind: 'event',
			event: ev,
			startIso,
			endIso,
			allDay,
			reassign,
			prev,
			datetimeLabel: formatDateTimeInOrgTz(startIso, allDay)
		};
		confirmRescheduleOpen = true;
	}

	// PATCH an Event move (confirm popup Save path). Reverts the optimistic move on
	// failure. No notify step — Events don't message a client.
	async function persistEventReschedule(move: EventMove): Promise<boolean> {
		const revert = () => {
			if (move.prev?.start_at)
				eventsStore.optimisticUpdate(move.event.id, {
					start_at: move.prev.start_at,
					end_at: move.prev.end_at,
					all_day: move.prev.all_day,
					assigned_to: move.prev.assigned_to,
					assignee_name: move.prev.assignee_name,
					assignee_count: move.prev.assignee_count
				});
		};
		try {
			// All-day events carry no end — omit it so the API forces NULL.
			const payload: Record<string, unknown> = { start_at: move.startIso, all_day: move.allDay };
			if (!move.allDay) payload.end_at = move.endIso;
			// Day-view cross-column drop reassigns the event's crew.
			if (move.reassign) payload.assigned_to = move.reassign.to;

			const res = await fetch(`/api/events/${move.event.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				revert();
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Could not reschedule the event.');
				return false;
			}
			// Re-assert the server-confirmed schedule + crew onto the list cache (mirrors the
			// visit path). The event PATCH echoes assigned_to + assignee_name.
			const body = (await res.json()) as {
				data: {
					start_at: string | null;
					end_at: string | null;
					all_day: boolean;
					assigned_to: string | null;
					assignee_name: string | null;
				};
			};
			eventsStore.optimisticUpdate(move.event.id, {
				start_at: body.data.start_at ?? move.startIso,
				end_at: body.data.end_at,
				all_day: body.data.all_day,
				...(move.reassign
					? {
							assigned_to: body.data.assigned_to,
							assignee_name: body.data.assignee_name,
							assignee_count: body.data.assigned_to ? 1 : 0
						}
					: {})
			});
			return true;
		} catch {
			revert();
			toast.error('Could not reschedule the event.');
			return false;
		}
	}

	// Confirm popup — Cancel (or dismiss): snap the card back, no server call.
	function onConfirmRescheduleCancel() {
		if (rescheduleDecided) {
			// A Save is in flight / done — this close is not a real cancel. Reset the guard.
			rescheduleDecided = false;
			return;
		}
		const move = pendingMove;
		if (move) {
			if (move.kind === 'appt') {
				if (move.prev) appointmentsStore.optimisticUpdate(move.item.id, move.prev);
			} else if (move.prev?.start_at) {
				eventsStore.optimisticUpdate(move.event.id, {
					start_at: move.prev.start_at,
					end_at: move.prev.end_at,
					all_day: move.prev.all_day
				});
			}
		}
		pendingMove = null;
	}

	// Confirm popup — Save: persist the move (button shows a spinner while it saves),
	// then, if the client is reachable, open the notify popup so the contractor can
	// tell them; otherwise finish with a plain success toast.
	async function onConfirmRescheduleSave() {
		const move = pendingMove;
		if (!move) return;
		rescheduleDecided = true; // block the dialog's close→onCancel from reverting
		rescheduleSaving = true;

		// Events just save (no client to notify) — persist and finish.
		if (move.kind === 'event') {
			const ok = await persistEventReschedule(move);
			rescheduleSaving = false;
			pendingMove = null;
			if (ok) toast.success('Event rescheduled.');
			return;
		}

		const ok = await persistReschedule(move);
		rescheduleSaving = false;
		if (!ok) {
			// persistReschedule already reverted the optimistic move + toasted.
			pendingMove = null;
			return;
		}
		if (move.item.contact_phone || move.item.contact_email) {
			notifyOpen = true; // step 2 — appears as the confirm popup closes
		} else {
			pendingMove = null;
			toast.success('Appointment rescheduled.');
		}
	}

	// PATCH the move with notify_channel:'none' — persist ONLY. On failure revert the
	// optimistic move. No success toast (the caller decides what comes next).
	async function persistReschedule(move: ApptMove): Promise<boolean> {
		try {
			// Anytime visits carry no end — omit it so the API forces NULL.
			const payload: Record<string, unknown> = {
				scheduled_start: move.startIso,
				all_day: move.allDay,
				notify_channel: 'none'
			};
			if (!move.allDay) payload.scheduled_end = move.endIso;
			// Day-view cross-column drop reassigns the visit's crew (legacy single-assignee
			// shape: this member becomes the sole crew, or null unassigns).
			if (move.reassign) payload.assigned_to = move.reassign.to;

			const res = await fetch(`/api/appointments/${move.item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				if (move.prev) appointmentsStore.optimisticUpdate(move.item.id, move.prev);
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(
					res.status === 409
						? 'Time conflict with another appointment.'
						: (body.error ?? 'Could not reschedule.')
				);
				return false;
			}
			const body = (await res.json()) as { data: AppointmentDetail };
			appointmentsStore.setDetail(body.data);
			// Re-assert the server-confirmed schedule onto the list cache. setDetail only
			// touches the detail cache; without this a revalidation that raced in with stale
			// data could leave the calendar card in the old slot until a full reload.
			appointmentsStore.optimisticUpdate(move.item.id, {
				// Non-null: this is a drag-reschedule confirm, so the server always returns a dated
				// visit (a calendar card can't be dragged into the date-less 'unscheduled' state).
				scheduled_start: body.data.scheduled_start!,
				scheduled_end: body.data.scheduled_end,
				all_day: body.data.all_day,
				// Re-assert the server-confirmed crew when this move reassigned it.
				...(move.reassign
					? {
							assigned_to: body.data.assigned_to,
							assignee_name: body.data.assignee_name,
							assignee_count: body.data.assigned_to ? 1 : 0
						}
					: {})
			});
			// Write-through to the SEPARATE jobs caches. Moving a visit re-pins its parent one-off
			// job's schedule server-side; the server echoes the fresh date in `affected_job` so the
			// job's list row + detail (and its Today/Upcoming badge) update in this same tick instead
			// of showing a stale badge until a reload.
			const job = body.data.affected_job;
			if (job) {
				jobsStore.update({
					id: job.id,
					scheduled_start: job.scheduled_start,
					scheduled_end: job.scheduled_end
				});
				jobDetailStore.patch(job.id, (prev) => ({
					...prev,
					scheduled_start: job.scheduled_start,
					scheduled_end: job.scheduled_end
				}));
			}
			return true;
		} catch {
			if (move.prev) appointmentsStore.optimisticUpdate(move.item.id, move.prev);
			toast.error('Could not reschedule.');
			return false;
		}
	}

	// Notify popup — Send: the move is already saved, so this is a follow-up PATCH that
	// carries ONLY the notify channel + optional edited copy. The server emits the
	// client "your appointment moved to…" confirmation (time unchanged since the save).
	async function sendRescheduleNotification(
		move: ApptMove,
		channel: NotifyChannel,
		edited: NotifyEdited | null
	): Promise<boolean> {
		try {
			const payload: Record<string, unknown> = { notify_channel: channel };
			if (edited?.sms) payload.notify_sms_message = edited.sms;
			if (edited?.subject) payload.notify_email_subject = edited.subject;
			if (edited?.body) payload.notify_email_message = edited.body;

			const res = await fetch(`/api/appointments/${move.item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				toast.error(body.error ?? 'Could not send the update.');
				return false;
			}
			const body = (await res.json()) as { data: AppointmentDetail };
			appointmentsStore.setDetail(body.data);
			toast.success('Client notified.');
			return true;
		} catch {
			toast.error('Could not send the update.');
			return false;
		}
	}

	// Notify-dialog handlers. The move is already saved — these only decide whether to
	// tell the client.
	async function onNotifyConfirm(
		channels: ('email' | 'sms')[],
		edited: NotifyEdited | null
	): Promise<boolean> {
		const move = pendingMove;
		if (!move || move.kind !== 'appt') return true;
		const channel: NotifyChannel =
			channels.length === 2 ? 'both' : channels[0] === 'email' ? 'email' : 'sms';
		await sendRescheduleNotification(move, channel, edited);
		pendingMove = null;
		return true; // NotifyDialog then closes
	}

	function onNotifySkip() {
		// Move already saved — just close without notifying.
		pendingMove = null;
		notifyOpen = false;
	}

	// Short, human label per appointment type — shown in the card's accent pill.
	const TYPE_LABELS: Record<AppointmentType, string> = {
		estimate: 'Estimate',
		job_start: 'Job',
		follow_up: 'Follow-up',
		inspection: 'Inspection',
		other: 'Visit'
	};

	// Initials fallback for the contact avatar (no photo is stored).
	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

	// The card's time pill leads with a glyph that matches its state: an alarm on a
	// late visit, a calendar on an Anytime visit, a clock otherwise.
	function timeIcon(state: VisitCardState, allDay: boolean): string {
		if (state === 'late') return 'ri-alarm-warning-line';
		if (allDay) return 'ri-calendar-event-line';
		return 'ri-time-line';
	}
</script>

<div
	bind:this={scrollerEl}
	class={['cal-week', `cal-week--${density}`, columnMode === 'day' && 'cal-week--day']}
	style="--cal-cols: {columns.length}; --cal-week-head-h: {headH}px; --cal-week-anytime-h: {anytimeH}px; --cal-week-title-h: {titleH}px;"
>
	<!-- Shared visit-card rows — rendered identically by the timed grid card and the
	     Anytime-lane card so the two never drift (Rule 23, one source of truth). The only
	     difference is `showTime`: the Anytime card is untimed, so it never paints the time
	     row. Timed cards additionally get a resize handle at their call site (not here). -->
	{#snippet visitRows(
		appt: AppointmentListItem,
		state: VisitCardState,
		mark: string | null,
		showTime: boolean
	)}
		{@const startTime = formatTimeInOrgTz(appt.scheduled_start, orgTz)}
		{@const endTime = appt.scheduled_end ? formatTimeInOrgTz(appt.scheduled_end, orgTz) : null}
		<!-- The corner holds ONE mark: the repeat glyph while the visit is OPEN (part of a
		     multi-visit series), replaced by its outcome (✓/✕/⚠) once the visit is marked
		     done/closed. Pinned to the card, not to the time row, which is the first to drop. -->
		{#if mark}
			<i
				class={['cal-week__event-mark', mark]}
				title={visitCardStateLabel(state)}
				aria-hidden="true"
			></i>
		{:else if appt.is_recurring_visit}
			<i
				class="cal-week__event-mark cal-week__event-mark--repeat ri-repeat-2-line"
				title="Part of a multi-visit series"
				aria-hidden="true"
			></i>
		{/if}
		{#if showTime}
			<span class="cal-week__event-top">
				<span class="cal-week__event-timepill">
					<i class={timeIcon(state, appt.all_day)} aria-hidden="true"></i>
					<span class="cal-week__event-timepill-text">
						{#if appt.all_day}
							Anytime
						{:else}
							{startTime}{#if endTime}&nbsp;– {endTime}{/if}
						{/if}
					</span>
				</span>
			</span>
		{/if}
		<p class="cal-week__event-headline">
			<!-- Client and job title share ONE truncating line, so a long pair ellipsises at
			     the end ("Jafar Khan – HVAC Install…") instead of each half clipping on its
			     own. This is the row that always survives. -->
			<span class="cal-week__event-names">
				<span class="cal-week__event-client">{appt.contact_name}</span><span
					class="cal-week__event-sep"
					>&nbsp;–
				</span><span class="cal-week__event-title">{appt.title}</span>
			</span>
		</p>
		{#if appt.location}
			<p class="cal-week__event-meta">
				<i class="ri-map-pin-2-line" aria-hidden="true"></i>
				<span>{appt.location}</span>
			</p>
		{/if}
		<div class="cal-week__event-footer">
			<span class="cal-week__event-pill">
				<span class="cal-week__event-pill-dot" aria-hidden="true"></span>
				{visitCardStateLabel(state)}
			</span>
			{#if appt.type !== 'job_start'}
				<!-- Placeholder until estimate/inspection cards get their own design: the rail
				     now carries STATUS, so type falls back to a plain word. -->
				<span class="cal-week__event-kind"
					>{appt.request_id ? 'Assessment' : TYPE_LABELS[appt.type]}</span
				>
			{/if}
			{#if appt.assignee_name}
				<span class="cal-week__event-assignee" title={appt.assignee_name}>
					{initials(appt.assignee_name)}
				</span>
			{/if}
		</div>
		{#if showTime && (appt.contact_phone || appt.contact_email)}
			<div class="cal-week__event-actions">
				{#if appt.contact_phone}
					<button
						type="button"
						class="cal-week__action-btn"
						title="Call {appt.contact_name}"
						onclick={(e) => {
							e.stopPropagation();
							window.location.href = `tel:${appt.contact_phone}`;
						}}
					>
						<i class="ri-phone-line" aria-hidden="true"></i>
					</button>
				{/if}
				{#if appt.contact_email}
					<button
						type="button"
						class="cal-week__action-btn"
						title="Message {appt.contact_name}"
						onclick={(e) => {
							e.stopPropagation();
							window.location.href = `/conversations?contact=${appt.contact_id}`;
						}}
					>
						<i class="ri-message-3-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>
		{/if}
	{/snippet}

	<!-- Day view only: single-day title ("Tue 21"), pinned above the member columns
	     (Jobber's day header). Its measured height offsets everything sticky below it. -->
	{#if columnMode === 'day'}
		<div bind:clientHeight={titleH} class="cal-week__daytitle">
			{dayTitleFmt.format(anchor)}
		</div>
	{/if}

	<!-- Column headers — sticky so they stay visible while the grid body scrolls. Its
	     measured height pins the Anytime lane directly beneath it. Week: day-of-week +
	     date. Day: a team-member avatar + name (one column per crew member). -->
	<div bind:clientHeight={headH} class="cal-week__head">
		<div class="cal-week__head-gutter"></div>
		{#each columns as col (col.key)}
			{#if columnMode === 'day'}
				{@const unassigned = col.memberId === UNASSIGNED_COL}
				{@const name = unassigned ? 'Unassigned' : (memberNameById.get(col.memberId!) ?? 'Member')}
				<div class="cal-week__head-member">
					<span
						class={['cal-week__head-avatar', unassigned && 'cal-week__head-avatar--unassigned']}
						aria-hidden="true"
					>
						{#if unassigned}
							<i class="ri-user-unfollow-line"></i>
						{:else}
							{initials(name)}
						{/if}
					</span>
					<span class="cal-week__head-membername" title={name}>{name}</span>
				</div>
			{:else}
				{@const today_ = isSameDay(col.date, today)}
				<div class={['cal-week__head-day', today_ && 'cal-week__head-day--today']}>
					<span class={['cal-week__head-dow', today_ && 'cal-week__head-dow--today']}>
						{weekdayFmt.format(col.date)}
					</span>
					<span class={['cal-week__head-date', today_ && 'cal-week__head-date--today']}>
						{col.date.getDate()}
					</span>
				</div>
			{/if}
		{/each}
	</div>

	<!-- Anytime lane: date-only visits, always pinned above the time grid (Jobber/Housecall Pro).
	     Shown even when empty so it reads as a persistent slot, like the hour rows. -->
	<div bind:this={anytimeEl} bind:clientHeight={anytimeH} class="cal-week__anytime">
		<div class="cal-week__anytime-gutter">
			<i class="ri-calendar-event-line" aria-hidden="true"></i>
			<span>Anytime</span>
		</div>
		{#each columns as col, i (col.key)}
			{@const today_ = columnMode === 'week' && isSameDay(col.date, today)}
			{@const expanded = expandedAnytime.has(col.key)}
			{@const hiddenCount = col.anytime.length - ANYTIME_COLLAPSED}
			{@const visibleAnytime = expanded ? col.anytime : col.anytime.slice(0, ANYTIME_COLLAPSED)}
			<button
				type="button"
				data-col-index={i}
				onclick={(e) => onAnytimeColumnClick(e, i)}
				class={[
					'cal-week__anytime-col',
					today_ && 'cal-week__anytime-col--today',
					drag?.mode === 'move' &&
						dropZone === 'anytime' &&
						drag.colIndex === i &&
						'cal-week__anytime-col--drop',
					drag ? 'cal-week__anytime-col--grabbing' : canCreate && 'cal-week__anytime-col--copy'
				]}
				aria-label={canCreate ? `New Anytime visit on ${col.date.toDateString()}` : undefined}
			>
				{#each visibleAnytime as blk (blockId(blk))}
					{#if blk.kind === 'appt'}
						{@const ev = blk.appt}
						{@const state = deriveVisitCardState(ev, now)}
						{@const mark = visitCardStateIcon(state)}
						<!-- Anytime visits render the EXACT timed-grid card, minus the time row
						     (showTime=false). Same state colours, status pill, and corner mark — so a
						     past Anytime visit goes Late for free. See _appointments.scss
						     `&__event--anytime` for the container-collapse override. -->
						<a
							href={ev.request_id ? `/requests/${ev.request_id}` : `/appointments/${ev.id}`}
							draggable="false"
							use:prefetchOnIntent={() =>
								ev.request_id ? undefined : appointmentsStore.prefetchDetail(ev.id)}
							onpointerdown={(e) => onAnytimeChipPointerDown(e, ev, i)}
							ondragstart={(e) => e.preventDefault()}
							onclick={(e) => openDetail(e, ev)}
							class={[
								'cal-week__event',
								'cal-week__event--anytime',
								`cal-week__event--state-${state}`,
								(mark || ev.is_recurring_visit) && 'cal-week__event--marked',
								canReschedule && 'cal-week__event--reschedulable'
							]}
						>
							{@render visitRows(ev, state, mark, false)}
						</a>
					{:else if blk.kind === 'event'}
						{@const evt = blk.event}
						<!-- All-day Event: neutral grey chip, read-only. The lane's create-on-click
						     already ignores clicks that land on a `.cal-week__anytime-chip`. -->
						{@const evtDone = isEventPast(evt, now)}
						<div
							role="button"
							tabindex="0"
							class={[
								'cal-week__anytime-chip',
								'cal-week__anytime-chip--event',
								evtDone && 'cal-week__anytime-chip--completed'
							]}
							title={evt.description ?? evt.title}
							onclick={(e) => openEventDetail(e, evt)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ')
									openEventDetail(e as unknown as MouseEvent, evt);
							}}
						>
							<span class="cal-week__anytime-chip-title">
								{#if evtDone}<i class="cal-week__anytime-chip-tick ri-check-line" aria-hidden="true"
									></i>{/if}{evt.title}</span
							>
							<!-- An Event is a team block — its "who" is the assignee, never a customer
							     (Jobber never headlines an event with a client). -->
							<span class="cal-week__anytime-chip-sub">{evt.assignee_name ?? 'Event'}</span>
						</div>
					{:else}
						{@const rem = blk.reminder}
						{@const rState = reminderDisplayStatus(rem)}
						<!-- All-day invoice reminder: read-only amber chip. Click → detail popover. The
						     lane's create-on-click already ignores clicks on a `.cal-week__anytime-chip`. -->
						<div
							role="button"
							tabindex="0"
							class={[
								'cal-week__anytime-chip',
								'cal-week__anytime-chip--reminder',
								`cal-week__anytime-chip--rem-${rState}`
							]}
							title={rem.description || 'Invoice reminder'}
							onclick={(e) => reminderCtl.open(rem, e.currentTarget)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') reminderCtl.open(rem, e.currentTarget);
							}}
						>
							<span class="cal-week__anytime-chip-title">
								<i class="ri-bill-line" aria-hidden="true"></i>{rem.description ||
									'Invoice reminder'}
							</span>
							<span class="cal-week__anytime-chip-sub">{REMINDER_DISPLAY_LABEL[rState]}</span>
						</div>
					{/if}
				{/each}

				<!-- Collapse control: keep the lane compact by default (one card), expand on
				     demand. Not a nested <button> (this column IS a button) — a role="button"
				     span that stops propagation so the click doesn't also fire create-on-empty. -->
				{#if hiddenCount > 0}
					<div
						role="button"
						tabindex="0"
						class="cal-week__anytime-more"
						onclick={(e) => {
							e.stopPropagation();
							toggleAnytime(col.key);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								e.stopPropagation();
								toggleAnytime(col.key);
							}
						}}
					>
						{#if expanded}
							Show less
						{:else}
							View more ({hiddenCount})
						{/if}
					</div>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Body: time rail + 7 day columns -->
	<div
		bind:this={gridBodyEl}
		class="cal-week__body"
		style="min-height: {range.hours * HOUR_HEIGHT + TOP_GUTTER}px;"
	>
		<!-- Time rail -->
		<div class="cal-week__rail">
			{#each hourLabels as h (h.hour)}
				<div
					class={['cal-week__rail-label', h.isOffHours && 'cal-week__rail-label--off']}
					style="top: {pxFromMin(h.hour * 60)}px;"
				>
					{h.label}
				</div>
			{/each}
			<!-- Current-time pill in the gutter (the line itself lives in the columns, behind
			     the cards). Only when today is in view. -->
			{#if gridHasToday && nowVisible}
				<div class="cal-week__now-label" style="top: {pxFromMin(nowMin)}px;">
					{nowLabel}
				</div>
			{/if}
		</div>

		<!-- Grid columns (week: one per day · day: one per team member) -->
		{#each columns as col, i (col.key)}
			{@const today_ = columnMode === 'week' && isSameDay(col.date, today)}
			<button
				type="button"
				data-col-index={i}
				onpointerdown={(e) => onColumnPointerDown(e, i)}
				class={[
					'cal-week__col',
					today_ && 'cal-week__col--today',
					drag ? 'cal-week__col--grabbing' : canCreate && 'cal-week__col--copy'
				]}
				aria-label={canCreate ? `New appointment on ${col.date.toDateString()}` : undefined}
			>
				<!-- Hour grid lines & off-hours shading -->
				{#each hourLabels as h (h.hour)}
					<div
						class={['cal-week__line', h.isOffHours && 'cal-week__line--off']}
						style="top: {pxFromMin(h.hour * 60)}px; height: {HOUR_HEIGHT}px;"
					></div>
					<!-- half-hour subline -->
					<div class="cal-week__subline" style="top: {pxFromMin(h.hour * 60 + 30)}px;"></div>
				{/each}

				<!-- Now-line: a thin rule across every column, BEHIND the cards (its time label
				     is the gutter pill). Shown on the whole grid when the visible day is today. -->
				{#if gridHasToday && nowVisible}
					<div class="cal-week__now" style="top: {pxFromMin(nowMin)}px;"></div>
				{/if}

				<!-- Blocks: visits (colored, draggable) + Events (neutral grey, read-only) -->
				{#each col.laidOut as ev (blockId(ev.block))}
					{@const top = pxFromMin(ev.startMin)}
					{@const height = pxFromMin(ev.paintEndMin) - top}
					{@const widthPct = 100 / ev.cols}
					{@const leftPct = ev.col * widthPct}
					{@const depthOffset = ev.cols > 1 ? ev.col * 2 : 0}
					{@const blockStyle = `top: ${top + depthOffset}px; height: ${height}px; left: calc(${leftPct}% + 2px); width: calc(${widthPct}% - 4px);`}
					{#if ev.block.kind === 'appt'}
						{@const appt = ev.block.appt}
						{@const dragging = drag?.mode === 'move' && drag.item?.id === appt.id}
						{@const state = deriveVisitCardState(appt, now)}
						{@const mark = visitCardStateIcon(state)}
						<a
							href={appt.request_id ? `/requests/${appt.request_id}` : `/appointments/${appt.id}`}
							draggable="false"
							use:prefetchOnIntent={() =>
								appt.request_id ? undefined : appointmentsStore.prefetchDetail(appt.id)}
							onpointerdown={(e) => onEventPointerDown(e, ev, appt, i)}
							ondragstart={(e) => e.preventDefault()}
							onclick={(e) => openDetail(e, appt)}
							class={[
								'cal-week__event',
								`cal-week__event--state-${state}`,
								(mark || appt.is_recurring_visit) && 'cal-week__event--marked',
								canReschedule && 'cal-week__event--reschedulable',
								dragging && 'cal-week__event--dragging'
							]}
							style={blockStyle}
						>
							<!-- Every row below is always rendered; the card's own @container rules
							     decide which survive at this height (see _appointments.scss). Rows are
							     revealed by PRIORITY but painted in this order, so the card never
							     reorders itself as it grows. The rows are the shared `visitRows`
							     snippet (also used by the Anytime lane); showTime=true adds the time row
							     and the hover call/message actions that only make sense on a timed card. -->
							{@render visitRows(appt, state, mark, true)}
							{#if canReschedule}
								<!-- Resize handle (bottom edge) -->
								<span
									data-resize
									role="slider"
									tabindex="-1"
									aria-label="Resize appointment end time"
									aria-valuenow={ev.endMin}
									onpointerdown={(e) => onResizePointerDown(e, ev, appt, i)}
									class="cal-week__resize"
								></span>
							{/if}
						</a>
					{:else if ev.block.kind === 'event'}
						{@const evt = ev.block.event}
						{@const dragging = drag?.mode === 'move' && drag.eventItem?.id === evt.id}
						{@const startTime = evt.start_at ? formatTimeInOrgTz(evt.start_at, orgTz) : ''}
						{@const endTime = evt.end_at ? formatTimeInOrgTz(evt.end_at, orgTz) : null}
						{@const eventDone = isEventPast(evt, now)}
						<div
							role="button"
							tabindex="0"
							class={[
								'cal-week__timeblock',
								eventDone && 'cal-week__timeblock--completed',
								canReschedule && 'cal-week__timeblock--draggable',
								dragging && 'cal-week__timeblock--dragging'
							]}
							style={blockStyle}
							title={evt.description ?? evt.title}
							onpointerdown={(e) => onTimeblockPointerDown(e, ev, evt, i)}
							onclick={(e) => openEventDetail(e, evt)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ')
									openEventDetail(e as unknown as MouseEvent, evt);
							}}
						>
							<!-- Same layout skeleton and container rules as a visit card, but no status
							     rail and no status pill: an Event is time that's BLOCKED, not work to be
							     done, so it stays the quietest thing on the grid. Once its window passes
							     Jobber auto-completes it — the corner glyph becomes a tick (ri-check-line),
							     exactly like a completed visit. -->
							<i
								class={[
									'cal-week__event-mark',
									eventDone ? 'ri-check-line' : 'ri-calendar-event-line'
								]}
								title={eventDone ? 'Completed' : 'Event'}
								aria-hidden="true"
							></i>
							<span class="cal-week__event-top">
								<span class="cal-week__event-timepill">
									<i class="ri-time-line" aria-hidden="true"></i>
									<span class="cal-week__event-timepill-text">
										{startTime}{#if endTime}&nbsp;– {endTime}{/if}
									</span>
								</span>
							</span>
							<p class="cal-week__event-headline">
								<span class="cal-week__event-names">
									<span class="cal-week__timeblock-title">{evt.title}</span>
								</span>
							</p>
							{#if evt.assignee_name}
								<p class="cal-week__timeblock-meta">
									<i class="ri-user-line" aria-hidden="true"></i>
									<span>{evt.assignee_name}</span>
								</p>
							{/if}
							<div class="cal-week__event-footer">
								<span class="cal-week__event-kind">Event</span>
							</div>
							{#if canReschedule}
								<!-- Resize handle (bottom edge) — drag to change the end time. -->
								<span
									data-resize
									role="slider"
									tabindex="-1"
									aria-label="Resize event end time"
									aria-valuenow={ev.endMin}
									onpointerdown={(e) => onTimeblockResizePointerDown(e, ev, evt, i)}
									class="cal-week__resize"
								></span>
							{/if}
						</div>
					{:else}
						{@const rem = ev.block.reminder}
						{@const rState = reminderDisplayStatus(rem)}
						<!-- Timed invoice reminder: read-only amber block (no drag / no resize — a
						     reminder is a nudge, not reschedulable work). Click → detail popover. -->
						<div
							role="button"
							tabindex="0"
							class={[
								'cal-week__timeblock',
								'cal-week__timeblock--reminder',
								`cal-week__timeblock--rem-${rState}`
							]}
							style={blockStyle}
							title={rem.description || 'Invoice reminder'}
							onpointerdown={(e) => e.stopPropagation()}
							onclick={(e) => reminderCtl.open(rem, e.currentTarget)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') reminderCtl.open(rem, e.currentTarget);
							}}
						>
							<i
								class="cal-week__event-mark ri-bill-line"
								title="Invoice reminder"
								aria-hidden="true"
							></i>
							<span class="cal-week__event-top">
								<span class="cal-week__event-timepill">
									<i class="ri-time-line" aria-hidden="true"></i>
									<span class="cal-week__event-timepill-text">
										{rem.all_day ? 'Anytime' : formatTimeInOrgTz(rem.scheduled_start!, orgTz)}
									</span>
								</span>
							</span>
							<p class="cal-week__event-headline">
								<span class="cal-week__event-names">
									<span class="cal-week__timeblock-title"
										>{rem.description || 'Invoice reminder'}</span
									>
								</span>
							</p>
							<p class="cal-week__timeblock-meta">
								<i class="ri-user-line" aria-hidden="true"></i>
								<span>{rem.contact_name}</span>
							</p>
							<div class="cal-week__event-footer">
								<span class="cal-week__event-kind">{REMINDER_DISPLAY_LABEL[rState]}</span>
							</div>
						</div>
					{/if}
				{/each}

				<!-- Drag ghost -->
				{#if drag && drag.colIndex === i && dropZone === 'grid' && (drag.moved || drag.mode === 'resize')}
					{@const gTop = pxFromMin(drag.ghostStartMin)}
					{@const gHeight = Math.max(20, pxFromMin(drag.ghostEndMin) - gTop)}
					<div class="cal-week__ghost" style="top: {gTop}px; height: {gHeight}px;">
						<span class="cal-week__ghost-label">
							{labelForMin(drag.ghostStartMin)} – {labelForMin(drag.ghostEndMin)}
						</span>
					</div>
				{/if}

				<!-- Tentative create block — stays painted behind the quick-create bubble. -->
				{#if pendingCreate && pendingCreate.colIndex === i}
					{@const pTop = pxFromMin(pendingCreate.startMin)}
					{@const pHeight = Math.max(20, pxFromMin(pendingCreate.endMin) - pTop)}
					<div
						class="cal-week__ghost cal-week__ghost--pending"
						style="top: {pTop}px; height: {pHeight}px;"
					>
						<span class="cal-week__ghost-label">
							{labelForMin(pendingCreate.startMin)} – {labelForMin(pendingCreate.endMin)}
						</span>
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>

<!-- Shared invoice-reminder detail popover (opened by a reminder block/chip click). -->
<ReminderDetailController bind:this={reminderCtl} {canInvoice} />

{#if popover}
	<QuickCreatePopover
		start={popover.start}
		end={popover.end}
		allDay={popover.allDay}
		point={{ x: popover.x, y: popover.y }}
		{assignees}
		{canEditAssignee}
		onCreated={() => onCreated?.()}
		onClose={() => {
			popover = null;
			pendingCreate = null;
		}}
	/>
{/if}

<!-- Click-a-card detail preview (Jobber-style): a draggable, free-floating bubble
     anchored beside the clicked card. `detailPopover` supplies the card + anchor. -->
{#if detailPopover}
	<CardDetailPopover
		item={detailItem}
		anchorEl={detailPopover.anchorEl}
		{orgTz}
		canEdit={canReschedule}
		onStatusChange={(id, status) => appointmentsStore.patchStatus(id, status)}
		onClose={() => {
			detailPopover = null;
		}}
	/>
{/if}

<!-- Click-an-Event preview (Jobber ref/event/4): Edit opens the shared modal, Delete
     soft-deletes. Reads the live event row from the store. -->
{#if eventDetailPopover}
	<EventDetailPopover
		event={eventDetailItem}
		anchorEl={eventDetailPopover.anchorEl}
		{orgTz}
		canEdit={canReschedule}
		onRefresh={() => onCreated?.()}
		onDeleted={(id) => {
			eventsStore.removeItem(id);
			eventDetailPopover = null;
			onCreated?.();
		}}
		onClose={() => {
			eventDetailPopover = null;
		}}
	/>
{/if}

{#if pendingMove}
	<!-- Step 1 — confirm the move (Cancel snaps back, Save persists with a spinner).
	     Same popup for visits and Events; only the copy differs. -->
	<ConfirmDialog
		bind:open={confirmRescheduleOpen}
		title={pendingMove.kind === 'event' ? 'Reschedule event?' : 'Reschedule appointment?'}
		description={pendingMove.kind === 'event'
			? `Move "${pendingMove.event.title}" to ${pendingMove.datetimeLabel}${reassignSuffix(pendingMove)}.`
			: `Move ${pendingMove.item.contact_name}'s ${TYPE_LABELS[pendingMove.item.type]} to ${pendingMove.datetimeLabel}${reassignSuffix(pendingMove)}.`}
		confirmLabel="Save"
		cancelLabel="Cancel"
		loading={rescheduleSaving}
		onConfirm={onConfirmRescheduleSave}
		onCancel={onConfirmRescheduleCancel}
	/>

	<!-- Step 2 (visits only) — after the save, ask whether/how to tell the client. -->
	{#if pendingMove.kind === 'appt'}
		<NotifyDialog
			bind:open={notifyOpen}
			title="Notify {firstName(pendingMove.item.contact_name)}?"
			subtitle="Moved to {pendingMove.datetimeLabel} — let them know."
			recipientName={pendingMove.item.contact_name}
			recipientEmail={pendingMove.item.contact_email}
			recipientPhone={pendingMove.item.contact_phone}
			editable
			mergeFields={RESCHEDULE_MERGE_FIELDS}
			fill={fillReschedule}
			defaultSms={RESCHEDULE_SMS_TEMPLATE}
			defaultSubject={RESCHEDULE_EMAIL_SUBJECT}
			defaultBody={RESCHEDULE_EMAIL_BODY}
			linkDisplay="your appointment page"
			linkForCount={RESCHEDULE_LINK_FOR_COUNT}
			notice="Edit the message to override it for this reschedule only. Leave it as-is to use your saved appointment template. The link and time fill in automatically when it sends."
			confirmLabel="Send update"
			confirmLoadingLabel="Sending…"
			confirmSuccessLabel="Sent"
			secondaryLabel="Skip"
			onSecondary={onNotifySkip}
			onConfirm={onNotifyConfirm}
		/>
	{/if}
{/if}
