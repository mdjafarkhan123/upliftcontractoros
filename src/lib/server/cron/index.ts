/**
 * Cron registration. Imported once from worker.ts on startup.
 *
 * Rules enforced here:
 *  - All schedules run in UTC.
 *  - A module-level Set acts as a per-job overlap guard. If a previous tick is
 *    still running, the new invocation is skipped with a structured warn log.
 *  - Every job is wrapped in runGuarded(): try/catch isolates failures so a
 *    single bad run never crashes worker.ts; structured logs capture timing
 *    and counts.
 */
import cron from 'node-cron';
import { createLogger } from '$lib/server/log';
import { runInvoiceOverdueSweep } from './invoiceOverdueSweep';
import { runQuoteExpirySweep } from './quoteExpirySweep';
import { runNotificationPurge } from './notificationPurge';
import { runOrgLifecycleAdvance } from './orgLifecycleAdvance';
import { runMonthlyGrowthSummary } from './monthlyGrowthSummary';
import { runWebchatSessionCleanup } from './webchatSessionCleanup';
import { runUnsnoozeConversations } from './unsnoozeConversations';
import { runUnreadCountReconcile } from './unreadCountReconcile';
import { runFollowUpDueSweep } from './followUpDueSweep';
import { runOpportunityFollowUpDueSweep } from './opportunityFollowUpDueSweep';
import { runOpportunityStaleDigest } from './opportunityStaleDigest';
import { runOpportunityArchiveSweep } from './opportunityArchiveSweep';
import { runContactPurgeSweep } from './contactPurgeSweep';
import { runSoftDeletePurgeSweep } from './softDeletePurgeSweep';
import { runSmsMonthlyGrant } from './smsMonthlyGrant';
import { runSmsMasterBalanceSync } from './smsMasterBalanceSync';

const log = createLogger('cron');

const running = new Set<string>();

export interface CronJobResult {
	processed_count?: number;
	skipped_count?: number;
	error_count?: number;
	scanned_count?: number;
	affected_count?: number;
	[key: string]: unknown;
}

export async function runGuarded(
	job: string,
	fn: () => Promise<CronJobResult | void>
): Promise<void> {
	if (running.has(job)) {
		log.warn({ job, reason: 'already_running' });
		return;
	}
	running.add(job);
	const startedAt = new Date();
	const startedMs = startedAt.getTime();
	try {
		const result = (await fn()) ?? {};
		const finishedAt = new Date();
		log.info({
			job,
			started_at: startedAt.toISOString(),
			finished_at: finishedAt.toISOString(),
			duration_ms: finishedAt.getTime() - startedMs,
			processed_count: result.processed_count ?? 0,
			skipped_count: result.skipped_count ?? 0,
			error_count: result.error_count ?? 0,
			scanned_count: result.scanned_count,
			affected_count: result.affected_count
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const finishedAt = new Date();
		log.error({
			job,
			started_at: startedAt.toISOString(),
			finished_at: finishedAt.toISOString(),
			duration_ms: finishedAt.getTime() - startedMs,
			error: message,
			error_count: 1
		});
	} finally {
		running.delete(job);
	}
}

interface CronSpec {
	name: string;
	schedule: string;
	run: () => Promise<CronJobResult | void>;
}

const JOBS: CronSpec[] = [
	{ name: 'org-lifecycle-advance', schedule: '0 1 * * *', run: runOrgLifecycleAdvance },
	{ name: 'invoice-overdue-sweep', schedule: '0 2 * * *', run: runInvoiceOverdueSweep },
	{ name: 'quote-expiry-sweep', schedule: '30 2 * * *', run: runQuoteExpirySweep },
	{ name: 'notification-purge', schedule: '0 3 * * *', run: runNotificationPurge },
	{ name: 'monthly-growth-summary', schedule: '0 6 1 * *', run: runMonthlyGrowthSummary },
	{ name: 'webchat-session-cleanup', schedule: '0 4 * * *', run: runWebchatSessionCleanup },
	{ name: 'unsnooze-conversations', schedule: '*/5 * * * *', run: runUnsnoozeConversations },
	{ name: 'unread-count-reconcile', schedule: '0 * * * *', run: runUnreadCountReconcile },
	{ name: 'follow-up-due-sweep', schedule: '*/15 * * * *', run: runFollowUpDueSweep },
	{
		name: 'opportunity-follow-up-due-sweep',
		schedule: '*/15 * * * *',
		run: runOpportunityFollowUpDueSweep
	},
	{ name: 'opportunity-stale-digest', schedule: '0 8 * * *', run: runOpportunityStaleDigest },
	{ name: 'opportunity-archive-sweep', schedule: '45 3 * * *', run: runOpportunityArchiveSweep },
	{ name: 'contact-purge-sweep', schedule: '15 3 * * *', run: runContactPurgeSweep },
	{ name: 'soft-delete-purge-sweep', schedule: '45 3 * * *', run: runSoftDeletePurgeSweep },
	{ name: 'sms-monthly-grant', schedule: '0 5 1 * *', run: runSmsMonthlyGrant },
	{ name: 'sms-master-balance-sync', schedule: '*/15 * * * *', run: runSmsMasterBalanceSync }
];

let registered = false;

export function registerCronJobs(): void {
	if (registered) return;
	registered = true;
	for (const job of JOBS) {
		cron.schedule(
			job.schedule,
			() => {
				void runGuarded(job.name, job.run);
			},
			{ timezone: 'UTC' }
		);
		log.info({ job: job.name, scheduled: job.schedule, timezone: 'UTC' });
	}
}
