import { outboxEvents } from '$lib/server/db/schema';
import type { db as dbClient } from '$lib/server/db/client';
import { isWithinQuietHours } from '$lib/server/sms/quietHours';
import type { NotificationType, NotificationPriority } from '$lib/notifications/types';

const env = process.env;

type DrizzleDb = typeof dbClient;
type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type DbOrTx = DrizzleDb | DrizzleTx;

/**
 * Staff-facing notification delivery (Notification system Stage 1.c).
 *
 * Internal alerts to team members go to org_members.email / notification_phone —
 * NEVER through the contact/conversation pipeline (that is customer-facing). Each
 * extra channel beyond in-app/push is emitted as its own durable outbox event so
 * the send is retryable and isolated (per-channel fan-out, PagerDuty/Knock style).
 */

/** Absolute app base for deep links inside member alerts (email/SMS bodies). */
function appBaseUrl(): string | null {
	const base = (env.APP_URL ?? env.PUBLIC_BASE_URL)?.trim();
	return base ? base.replace(/\/$/, '') : null;
}

/** Build an absolute deep link from a relative app route (e.g. `/inbox/{id}`). */
export function memberDeepLink(route: string): string {
	if (route.startsWith('http')) return route;
	const base = appBaseUrl();
	if (!base) return route; // relative fallback — still readable in an email
	return `${base}${route.startsWith('/') ? '' : '/'}${route}`;
}

/**
 * Whether email/SMS should be suppressed for a member's PERSONAL quiet hours
 * (distinct from the org's customer-facing TCPA window). Critical-priority alerts
 * always break through (matches PagerDuty's high-urgency DND override). Fails open
 * — a timezone fault never silently drops an alert. In-app/push are unaffected; the
 * member still sees the bell + push, only the intrusive channels are held back.
 */
export function quietHoursSuppressed(args: {
	enabled: boolean;
	startHour: number | null;
	endHour: number | null;
	timezone: string;
	priority: NotificationPriority;
	now?: Date;
}): boolean {
	if (args.priority === 'critical') return false;
	if (!args.enabled) return false;
	if (args.startHour == null || args.endHour == null) return false;
	try {
		return isWithinQuietHours(args.now ?? new Date(), args.timezone, args.startHour, args.endHour);
	} catch {
		return false;
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Render a staff notification into a plain system-email shape (subject/text/html).
 * Kept deliberately simple — this is a platform alert to a team member, not a
 * branded customer message. Used both at emit time and by the outbox handler.
 */
export function renderMemberEmail(input: { title: string; body?: string | null; url: string }): {
	subject: string;
	text: string;
	html: string;
} {
	const title = input.title.trim();
	const body = input.body?.trim() ?? '';

	const textLines = [title];
	if (body) textLines.push('', body);
	textLines.push('', `Open in your dashboard: ${input.url}`);
	const text = textLines.join('\n');

	const html = [
		`<p style="margin:0 0 8px;font-size:16px;font-weight:600">${escapeHtml(title)}</p>`,
		body ? `<p style="margin:0 0 16px;color:#444">${escapeHtml(body)}</p>` : '',
		`<p style="margin:0"><a href="${escapeHtml(input.url)}" style="color:#2563eb">Open in your dashboard</a></p>`
	].join('');

	return { subject: title, text, html };
}

/**
 * Render a staff notification into a single SMS body. Deliberately terse — SMS is
 * money + a small screen, so it is title, an optional one-line detail, then the deep
 * link (Twilio truncates/segments long bodies). Composed at emit time and carried on
 * the outbox payload so the SMS worker stays dumb.
 */
export function renderMemberSms(input: { title: string; body?: string | null; url: string }): string {
	const lines = [input.title.trim()];
	const detail = input.body?.trim();
	if (detail) lines.push(detail);
	lines.push(input.url);
	return lines.join('\n');
}

export type MemberEmailEmit = {
	orgId: string;
	memberId: string;
	type: NotificationType;
	toEmail: string;
	title: string;
	body?: string | null;
	/** Absolute deep link (already resolved via memberDeepLink). */
	url: string;
	/** The originating business event id — anchors the dedup key across retries. */
	outboxEventId: string;
};

/**
 * Emit a durable `member_notification.email.requested` outbox event. Deduped per
 * (business event × recipient) so a notificationWorker retry never double-queues,
 * and distinct conversation messages never collapse into one email. The outbox
 * worker delivers it inline via sendSystemEmail.
 */
export async function emitMemberEmail(dbOrTx: DbOrTx, e: MemberEmailEmit): Promise<void> {
	await dbOrTx
		.insert(outboxEvents)
		.values({
			org_id: e.orgId,
			event_type: 'member_notification.email.requested',
			resource_type: 'org_member',
			resource_id: e.memberId,
			payload: {
				org_id: e.orgId,
				member_id: e.memberId,
				type: e.type,
				to_email: e.toEmail,
				title: e.title,
				body: e.body ?? null,
				url: e.url
			},
			idempotency_key: `member_notif.email:${e.outboxEventId}:${e.memberId}`
		})
		.onConflictDoNothing({ target: outboxEvents.idempotency_key });
}

export type MemberSmsEmit = {
	orgId: string;
	memberId: string;
	type: NotificationType;
	/** The member's E.164 notification phone (NOT a customer number). */
	notificationPhone: string;
	/** The fully-rendered SMS body (already built via renderMemberSms). */
	body: string;
	/** The originating business event id — anchors the dedup key across retries. */
	outboxEventId: string;
};

/**
 * Emit a durable `member_notification.sms.requested` outbox event. Unlike email
 * (delivered inline), this routes to the SMS queue so it goes through the org SMS
 * master-gate + credit reservation (real Twilio money) — but writes NO messages /
 * conversation row. Deduped per (business event × recipient) so a notificationWorker
 * retry never double-queues a staff text.
 */
export async function emitMemberSms(dbOrTx: DbOrTx, e: MemberSmsEmit): Promise<void> {
	await dbOrTx
		.insert(outboxEvents)
		.values({
			org_id: e.orgId,
			event_type: 'member_notification.sms.requested',
			resource_type: 'org_member',
			resource_id: e.memberId,
			payload: {
				org_id: e.orgId,
				member_id: e.memberId,
				type: e.type,
				notification_phone: e.notificationPhone,
				body: e.body
			},
			idempotency_key: `member_notif.sms:${e.outboxEventId}:${e.memberId}`
		})
		.onConflictDoNothing({ target: outboxEvents.idempotency_key });
}
