/**
 * Cron — SMS master-balance sync (PO Safety Floor).
 *
 * Schedule: every 15 minutes.
 * Purpose:  Refresh the cached Twilio master-account balance and AUTO-PAUSE all
 *           outbound SMS (BullMQ queue pause) if it has fallen below the
 *           PO-configured floor. It NEVER auto-resumes — resuming is manual via
 *           /jafar (which re-verifies balance >= floor first), so a still-low
 *           account can't flap back on.
 * Failure behavior: runGuarded() catches and logs; a failed Twilio fetch leaves
 *           the cached balance and current pause state untouched.
 */
import { refreshMasterBalance } from '$lib/server/sms/masterFloor';
import type { CronJobResult } from './index';

export async function runSmsMasterBalanceSync(): Promise<CronJobResult> {
	if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
		return { scanned_count: 0, processed_count: 0, skipped_count: 1, error_count: 0 };
	}

	const { availableCredit, currency, floor, autoPaused } = await refreshMasterBalance();

	return {
		scanned_count: 1,
		processed_count: 1,
		affected_count: autoPaused ? 1 : 0,
		skipped_count: 0,
		error_count: 0,
		available_credit: availableCredit,
		currency,
		floor,
		auto_paused: autoPaused
	};
}
