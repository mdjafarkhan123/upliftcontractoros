import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { platformSettings } from '$lib/server/db/schema';
import { smsQueue } from '$lib/server/queue/bullmq';
import { fetchTwilioBalance } from '$lib/server/twilio/balance';
import { createLogger } from '$lib/server/log';

const log = createLogger('sms.master-floor');
const SINGLETON_ID = 'global';

/**
 * The SMS kill switch is BullMQ-native: pausing the `sms` queue (a single flag in
 * Redis) makes the standalone worker stop claiming jobs — backlog sits untouched
 * in Redis, no polling, no re-enqueue. Resuming drains it. `platform_settings`
 * stores the configured floor, the cached Twilio master balance, and paused_at/reason
 * (audit/display); BullMQ's isPaused() is the source of truth for paused state.
 */

export type SmsControlState = {
	floor: number;
	balance: number | null;
	balanceAt: Date | null;
	currency: string | null;
	paused: boolean;
	pausedAt: Date | null;
	pausedReason: string | null;
	waitingCount: number;
	delayedCount: number;
};

/** Read the singleton config row, creating it on first access if missing. */
async function getRow() {
	const [row] = await db
		.select()
		.from(platformSettings)
		.where(eq(platformSettings.id, SINGLETON_ID))
		.limit(1);
	if (row) return row;
	await db.insert(platformSettings).values({ id: SINGLETON_ID }).onConflictDoNothing();
	const [created] = await db
		.select()
		.from(platformSettings)
		.where(eq(platformSettings.id, SINGLETON_ID))
		.limit(1);
	return created;
}

/** Full control state for the /jafar panel: config + cache + live BullMQ status. */
export async function getSmsControlState(): Promise<SmsControlState> {
	const row = await getRow();
	const queue = smsQueue();
	const [paused, waitingCount, delayedCount] = await Promise.all([
		queue.isPaused(),
		queue.getWaitingCount(),
		queue.getDelayedCount()
	]);
	return {
		floor: Number(row.sms_master_floor),
		balance: row.sms_master_balance === null ? null : Number(row.sms_master_balance),
		balanceAt: row.sms_master_balance_at,
		currency: row.sms_master_balance_currency,
		paused,
		pausedAt: row.sms_paused_at,
		pausedReason: row.sms_paused_reason,
		waitingCount,
		delayedCount
	};
}

/** PO-configured safety floor (master-account currency). 0 disables auto-pause. */
export async function setMasterFloor(floor: string): Promise<void> {
	await getRow(); // ensure row exists
	await db
		.update(platformSettings)
		.set({ sms_master_floor: floor, updated_at: new Date() })
		.where(eq(platformSettings.id, SINGLETON_ID));
}

/** Pause all outbound SMS (BullMQ queue pause) and record why, for the panel. */
export async function pauseSms(reason: string): Promise<void> {
	await smsQueue().pause();
	await getRow();
	await db
		.update(platformSettings)
		.set({ sms_paused_at: new Date(), sms_paused_reason: reason, updated_at: new Date() })
		.where(eq(platformSettings.id, SINGLETON_ID));
	log.warn({ phase: 'paused', reason });
}

/** Resume the SMS queue; the worker immediately drains the backlog. */
export async function resumeSms(): Promise<void> {
	await smsQueue().resume();
	await getRow();
	await db
		.update(platformSettings)
		.set({ sms_paused_at: null, sms_paused_reason: null, updated_at: new Date() })
		.where(eq(platformSettings.id, SINGLETON_ID));
	log.info({ phase: 'resumed' });
}

export type RefreshResult = {
	availableCredit: number;
	currency: string;
	floor: number;
	autoPaused: boolean;
};

/**
 * Fetch the live master balance, cache it, and AUTO-PAUSE (never auto-resume) if
 * it has fallen below a configured floor and the queue isn't already paused.
 * Used by the 15-min cron and the on-demand /jafar refresh. Resume stays manual.
 */
export async function refreshMasterBalance(): Promise<RefreshResult> {
	const { availableCredit, currency } = await fetchTwilioBalance();
	const row = await getRow();
	const floor = Number(row.sms_master_floor);

	await db
		.update(platformSettings)
		.set({
			sms_master_balance: availableCredit.toFixed(4),
			sms_master_balance_at: new Date(),
			sms_master_balance_currency: currency,
			updated_at: new Date()
		})
		.where(eq(platformSettings.id, SINGLETON_ID));

	let autoPaused = false;
	if (floor > 0 && availableCredit < floor && !(await smsQueue().isPaused())) {
		await pauseSms(
			`Master balance ${currency} ${availableCredit.toFixed(2)} is below the floor of ${floor.toFixed(2)}.`
		);
		autoPaused = true;
	}

	return { availableCredit, currency, floor, autoPaused };
}
