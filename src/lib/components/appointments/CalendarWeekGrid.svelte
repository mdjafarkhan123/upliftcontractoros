<script lang="ts">
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
	import { prefetchOnIntent } from '$lib/actions/prefetch';
	import { appointmentsStore } from '$lib/stores/appointments.svelte';
	import { eventsStore } from '$lib/stores/events.svelte';
	import { jobsStore } from '$lib/stores/jobs.svelte';
	import { jobDetailStore } from '$lib/stores/jobDetail.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import QuickCreatePopover from './QuickCreatePopover.svelte';
	import CardDetailPopover from './CardDetailPopover.svelte';
	import NotifyDialog from '$lib/components/shared/NotifyDialog.svelte';
	import ConfirmDialog from '$lib/components/shared/ConfirmDialog.svelte';

	let {
		anchor,
		items,
		events = [],
		dayStartHour,
		dayEndHour,
		canCreate,
		canReschedule = false,
		assignees = [],
		canEditAssignee = false,
		density = 'comfortable',
		onCreated
	}: {
		anchor: Date;
		items: AppointmentListItem[];
		// Non-billable calendar Events (Jobber `Event`) — rendered as neutral grey
		// blocks alongside visits; draggable/resizable to reschedule (saves instantly,
		// no customer notify) when the viewer has the reschedule permission.
		events?: EventListItem[];
		dayStartHour: number;
		dayEndHour: number;
		canCreate: boolean;
		canReschedule?: boolean;
		assignees?: { id: string; full_name: string }[];
		canEditAssignee?: boolean;
		// Time-grid zoom: compact / comfortable / spacious (see DENSITY_HOUR_HEIGHT).
		// Drives row height + card content thresholds.
		density?: CalendarDensity;
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

	// A calendar block is either a visit (colored) or a non-billable Event (neutral grey).
	// Both are draggable to reschedule and share the grid, so they lay out in the same columns.
	type CalBlock =
		| { kind: 'appt'; appt: AppointmentListItem }
		| { kind: 'event'; event: EventListItem };

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

	type DayLane = {
		date: Date;
		key: string;
		laidOut: LaidOut[];
		// "Anytime"/all-day items for this day — rendered in the top lane, not a time row.
		anytime: CalBlock[];
	};

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

	// Which anchor-relative day-bucket key an instant falls into (org tz). Null if outside the week.
	function matchDayKey(d: Date): string | null {
		const tzKey = tzDateKey(d, orgTz);
		for (let i = 0; i < 7; i++) {
			const day = addDays(anchor, i);
			if (tzDateKey(day, orgTz) === tzKey) return dayKey(day);
		}
		return null;
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

	const days = $derived.by<DayLane[]>(() => {
		const buckets = new Map<
			string,
			{ block: CalBlock; startMin: number; endMin: number; paintEndMin: number }[]
		>();
		const anytimeBuckets = new Map<string, CalBlock[]>();
		for (let i = 0; i < 7; i++) {
			const k = dayKey(addDays(anchor, i));
			buckets.set(k, []);
			anytimeBuckets.set(k, []);
		}
		for (const item of items) {
			const matchedKey = matchDayKey(new Date(item.scheduled_start));
			if (!matchedKey) continue;

			// "Anytime" visits have no clock time — they live in the top lane, not a time row.
			if (item.all_day) {
				anytimeBuckets.get(matchedKey)?.push({ kind: 'appt', appt: item });
				continue;
			}
			const { startMin, endMin } = timedMinutes(item.scheduled_start, item.scheduled_end);
			buckets.get(matchedKey)?.push({
				block: { kind: 'appt', appt: item },
				startMin,
				endMin,
				paintEndMin: Math.max(endMin, startMin + MIN_BLOCK_MIN)
			});
		}
		// Events share the grid: all-day → anytime lane, timed → a neutral block.
		for (const ev of events) {
			if (!ev.start_at) continue; // unscheduled event — not on the grid
			const matchedKey = matchDayKey(new Date(ev.start_at));
			if (!matchedKey) continue;
			if (ev.all_day) {
				anytimeBuckets.get(matchedKey)?.push({ kind: 'event', event: ev });
				continue;
			}
			const { startMin, endMin } = timedMinutes(ev.start_at, ev.end_at);
			buckets.get(matchedKey)?.push({
				block: { kind: 'event', event: ev },
				startMin,
				endMin,
				paintEndMin: Math.max(endMin, startMin + MIN_BLOCK_MIN)
			});
		}
		const out: DayLane[] = [];
		for (let i = 0; i < 7; i++) {
			const d = addDays(anchor, i);
			const k = dayKey(d);
			out.push({
				date: d,
				key: k,
				laidOut: layoutDay(buckets.get(k) ?? []),
				anytime: anytimeBuckets.get(k) ?? []
			});
		}
		return out;
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
	const weekHasToday = $derived(days.some((d) => isSameDay(d.date, today)));
	const nowLabel = $derived(formatTimeInOrgTz(now, orgTz));

	// ── Coordinate / time helpers ───────────────────────────────────────────
	const DRAG_THRESHOLD = 4; // px before a pointerdown becomes a drag

	let gridBodyEl = $state<HTMLDivElement | null>(null);
	// Measured heights of the two pinned lanes — they drive the sticky offsets of
	// whatever pins beneath them (Anytime lane under the header, business-hours
	// caption under both).
	let headH = $state(0);
	let anytimeH = $state(0);
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
	let detailPopover = $state<{ item: AppointmentListItem; anchorEl: HTMLElement } | null>(null);

	function openDetail(e: MouseEvent, item: AppointmentListItem) {
		e.stopPropagation();
		e.preventDefault();
		if (justDragged) return; // a drag just ended — that's not a card-open click
		popover = null; // Jobber-style: only one popup at a time — close the create popup
		pendingCreate = null;
		detailPopover = { item, anchorEl: e.currentTarget as HTMLElement };
	}

	type NotifyChannel = 'sms' | 'email' | 'both' | 'none';

	// A committed-optimistically reschedule awaiting confirmation. The move is already
	// applied to the UI; the confirm popup decides whether to keep it. Visits (`appt`)
	// then offer a client-notify step; Events (`event`) just save (no customer).
	type ApptMove = {
		kind: 'appt';
		item: AppointmentListItem;
		startIso: string;
		endIso: string | null;
		allDay: boolean;
		prev: ReturnType<typeof appointmentsStore.optimisticUpdate>;
		datetimeLabel: string;
	};
	type EventMove = {
		kind: 'event';
		event: EventListItem;
		startIso: string;
		endIso: string | null;
		allDay: boolean;
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
		const date = days[colIndex]?.date;
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
			const date = days[d.colIndex]?.date;
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
	function applyReschedule(d: DragState, zone: 'grid' | 'anytime') {
		const item = d.item;
		if (!item) return;
		const date = days[d.colIndex]?.date;
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

		// No-op guard: same start, same end, same timed/untimed nature → nothing to do.
		if (
			startIso === item.scheduled_start &&
			(endIso ?? null) === (item.scheduled_end ?? null) &&
			allDay === item.all_day
		)
			return;

		const prev = appointmentsStore.optimisticUpdate(item.id, {
			scheduled_start: startIso,
			scheduled_end: endIso,
			all_day: allDay
		});

		// Stage the move and ask for confirmation before touching the server.
		rescheduleDecided = false;
		pendingMove = {
			kind: 'appt',
			item,
			startIso,
			endIso,
			allDay,
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
		const date = days[d.colIndex]?.date;
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

		// No-op guard: same start, same end, same timed/untimed nature → nothing to do.
		if (
			startIso === ev.start_at &&
			(endIso ?? null) === (ev.end_at ?? null) &&
			allDay === ev.all_day
		)
			return;

		const prev = eventsStore.optimisticUpdate(ev.id, {
			start_at: startIso,
			end_at: endIso,
			all_day: allDay
		});

		rescheduleDecided = false;
		pendingMove = {
			kind: 'event',
			event: ev,
			startIso,
			endIso,
			allDay,
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
					all_day: move.prev.all_day
				});
		};
		try {
			// All-day events carry no end — omit it so the API forces NULL.
			const payload: Record<string, unknown> = { start_at: move.startIso, all_day: move.allDay };
			if (!move.allDay) payload.end_at = move.endIso;

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
			// Re-assert the server-confirmed schedule onto the list cache (mirrors the visit path).
			const body = (await res.json()) as {
				data: { start_at: string | null; end_at: string | null; all_day: boolean };
			};
			eventsStore.optimisticUpdate(move.event.id, {
				start_at: body.data.start_at ?? move.startIso,
				end_at: body.data.end_at,
				all_day: body.data.all_day
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
				all_day: body.data.all_day
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
	class={['cal-week', `cal-week--${density}`]}
	style="--cal-week-head-h: {headH}px; --cal-week-anytime-h: {anytimeH}px;"
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

	<!-- Day headers — sticky so they stay visible while the grid body scrolls.
	     Its measured height pins the Anytime lane directly beneath it. -->
	<div bind:clientHeight={headH} class="cal-week__head">
		<div class="cal-week__head-gutter"></div>
		{#each days as day (day.key)}
			{@const today_ = isSameDay(day.date, today)}
			<div class={['cal-week__head-day', today_ && 'cal-week__head-day--today']}>
				<span class={['cal-week__head-dow', today_ && 'cal-week__head-dow--today']}>
					{weekdayFmt.format(day.date)}
				</span>
				<span class={['cal-week__head-date', today_ && 'cal-week__head-date--today']}>
					{day.date.getDate()}
				</span>
			</div>
		{/each}
	</div>

	<!-- Anytime lane: date-only visits, always pinned above the time grid (Jobber/Housecall Pro).
	     Shown even when empty so it reads as a persistent slot, like the hour rows. -->
	<div bind:this={anytimeEl} bind:clientHeight={anytimeH} class="cal-week__anytime">
		<div class="cal-week__anytime-gutter">
			<i class="ri-calendar-event-line" aria-hidden="true"></i>
			<span>Anytime</span>
		</div>
		{#each days as day, i (day.key)}
			{@const today_ = isSameDay(day.date, today)}
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
				aria-label={canCreate ? `New Anytime visit on ${day.date.toDateString()}` : undefined}
			>
				{#each day.anytime as blk (blk.kind === 'appt' ? blk.appt.id : blk.event.id)}
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
					{:else}
						{@const evt = blk.event}
						<!-- All-day Event: neutral grey chip, read-only. The lane's create-on-click
						     already ignores clicks that land on a `.cal-week__anytime-chip`. -->
						<div
							class="cal-week__anytime-chip cal-week__anytime-chip--event"
							title={evt.description ?? evt.title}
						>
							<span class="cal-week__anytime-chip-title">{evt.title}</span>
							<!-- An Event is a team block — its "who" is the assignee, never a customer
							     (Jobber never headlines an event with a client). -->
							<span class="cal-week__anytime-chip-sub">{evt.assignee_name ?? 'Event'}</span>
						</div>
					{/if}
				{/each}
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
			{#if weekHasToday && nowVisible}
				<div class="cal-week__now-label" style="top: {pxFromMin(nowMin)}px;">
					{nowLabel}
				</div>
			{/if}
		</div>

		<!-- Day columns -->
		{#each days as day, i (day.key)}
			{@const today_ = isSameDay(day.date, today)}
			<button
				type="button"
				data-col-index={i}
				onpointerdown={(e) => onColumnPointerDown(e, i)}
				class={[
					'cal-week__col',
					today_ && 'cal-week__col--today',
					drag ? 'cal-week__col--grabbing' : canCreate && 'cal-week__col--copy'
				]}
				aria-label={canCreate ? `New appointment on ${day.date.toDateString()}` : undefined}
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
				     is the gutter pill). Shown on the whole week that contains today. -->
				{#if weekHasToday && nowVisible}
					<div class="cal-week__now" style="top: {pxFromMin(nowMin)}px;"></div>
				{/if}

				<!-- Blocks: visits (colored, draggable) + Events (neutral grey, read-only) -->
				{#each day.laidOut as ev (ev.block.kind === 'appt' ? ev.block.appt.id : ev.block.event.id)}
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
							href={appt.request_id
								? `/requests/${appt.request_id}`
								: `/appointments/${appt.id}`}
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
					{:else}
						{@const evt = ev.block.event}
						{@const dragging = drag?.mode === 'move' && drag.eventItem?.id === evt.id}
						{@const startTime = evt.start_at ? formatTimeInOrgTz(evt.start_at, orgTz) : ''}
						{@const endTime = evt.end_at ? formatTimeInOrgTz(evt.end_at, orgTz) : null}
						<div
							class={[
								'cal-week__timeblock',
								canReschedule && 'cal-week__timeblock--draggable',
								dragging && 'cal-week__timeblock--dragging'
							]}
							style={blockStyle}
							title={evt.description ?? evt.title}
							onpointerdown={(e) => onTimeblockPointerDown(e, ev, evt, i)}
						>
							<!-- Same layout skeleton and container rules as a visit card, but no status
							     rail and no status pill: an Event is time that's BLOCKED, not work to be
							     done, so it stays the quietest thing on the grid. Placeholder design. -->
							<i
								class="cal-week__event-mark ri-calendar-event-line"
								title="Event"
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
		item={detailPopover.item}
		anchorEl={detailPopover.anchorEl}
		{orgTz}
		canEdit={canReschedule}
		onStatusChange={(id, status) => appointmentsStore.patchStatus(id, status)}
		onClose={() => {
			detailPopover = null;
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
			? `Move "${pendingMove.event.title}" to ${pendingMove.datetimeLabel}.`
			: `Move ${pendingMove.item.contact_name}'s ${TYPE_LABELS[pendingMove.item.type]} to ${pendingMove.datetimeLabel}.`}
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
