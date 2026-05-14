/**
 * Standalone worker process. Start with: npx tsx worker.ts
 * Never imported by SvelteKit — runs as a separate Node.js process.
 */

import './src/lib/server/workers/outboxWorker';
import './src/lib/server/workers/automationWorker';
import './src/lib/server/workers/notificationWorker';

console.log('[worker] Started — outbox, automation, notification workers active');
