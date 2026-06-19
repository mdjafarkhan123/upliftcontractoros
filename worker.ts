/**
 * Standalone worker process. Start with: npm run worker
 * Never imported by SvelteKit — runs as a separate Node.js process.
 */

// MUST be set before any import that pulls in $lib/server/db/client,
// otherwise the serverless config will be picked instead of the worker config.
process.env.WORKER_RUNTIME = 'true';

// Colorize logs by [worker-name] prefix — no external deps.
const WORKER_COLORS: Record<string, string> = {
	outbox: '\x1b[36m', // cyan
	automation: '\x1b[32m', // green
	notification: '\x1b[33m', // yellow
	email: '\x1b[35m', // magenta
	sms: '\x1b[34m', // blue
	messenger: '\x1b[35m', // magenta
	worker: '\x1b[1m' // bold (for this file's own logs)
};
const RESET = '\x1b[0m';

function colorize(args: unknown[]): unknown[] {
	if (typeof args[0] !== 'string') return args;
	const match = args[0].match(/^\[(\w+)\]/);
	const color = match ? WORKER_COLORS[match[1]] : undefined;
	if (!color) return args;
	return [`${color}${args[0]}${RESET}`, ...args.slice(1)];
}

const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _error = console.error.bind(console);
console.log = (...args) => _log(...colorize(args));
console.warn = (...args) => _warn(...colorize(args));
console.error = (...args) => _error(...colorize(args));

import './src/lib/server/workers/outboxWorker';
import './src/lib/server/workers/automationWorker';
import './src/lib/server/workers/notificationWorker';
import './src/lib/server/workers/emailWorker';
import './src/lib/server/workers/smsWorker';
import './src/lib/server/workers/mediaWorker';
import './src/lib/server/workers/messengerWorker';
import './src/lib/server/workers/contactImportWorker';
import { registerCronJobs } from './src/lib/server/cron';

registerCronJobs();

console.log(
	'[worker] Started — \x1b[36moutbox\x1b[0m \x1b[32mautomation\x1b[0m \x1b[33mnotification\x1b[0m \x1b[35memail\x1b[0m \x1b[34msms\x1b[0m \x1b[35mmessenger\x1b[0m \x1b[32mcontact-import\x1b[0m + cron active'
);
