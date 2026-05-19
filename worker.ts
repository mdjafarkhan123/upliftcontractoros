/**
 * Standalone worker process. Start with: npx tsx worker.ts
 * Never imported by SvelteKit — runs as a separate Node.js process.
 */

// MUST be set before any import that pulls in $lib/server/db/client,
// otherwise the serverless config will be picked instead of the worker config.
process.env.WORKER_RUNTIME = 'true';

import './src/lib/server/workers/outboxWorker';
import './src/lib/server/workers/automationWorker';
import './src/lib/server/workers/notificationWorker';
import './src/lib/server/workers/emailWorker';
import './src/lib/server/workers/smsWorker';
import { registerCronJobs } from './src/lib/server/cron';

registerCronJobs();

console.log('[worker] Started — outbox, automation, notification, email, sms workers + cron active');
