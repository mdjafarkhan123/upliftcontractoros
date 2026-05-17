import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const env = process.env;

const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error('DATABASE_URL is required.');
}

// Runtime detection. The worker process (worker.ts) sets WORKER_RUNTIME=true
// BEFORE importing anything else, so this evaluates correctly at module load.
const isWorker = env.WORKER_RUNTIME === 'true';

// Worker may use a direct Postgres connection (port 5432) for prepared-statement
// support + better long-lived perf. Falls back to DATABASE_URL otherwise.
const workerUrl = env.WORKER_DATABASE_URL || databaseUrl;
const activeUrl = isWorker ? workerUrl : databaseUrl;

// Detect Supabase transaction pooler (PgBouncer) — it does NOT support
// prepared statements. Using `prepare: true` against it causes intermittent
// silent failures and rolled-back transactions.
const isPooler = activeUrl.includes(':6543');

// Singleton across HMR / re-imports in the same process.
declare global {
	// eslint-disable-next-line no-var
	var __pgQueryClient: ReturnType<typeof postgres> | undefined;
}

function buildClient(): ReturnType<typeof postgres> {
	if (isWorker) {
		// Long-running Railway worker. Prefer direct connection (5432) for
		// prepared statements + higher pool. If still on the pooler, force
		// prepare:false to avoid the PgBouncer prepared-statement bug.
		return postgres(activeUrl, {
			prepare: !isPooler,
			max: isPooler ? 5 : 10,
			idle_timeout: 60,
			connect_timeout: 10
		});
	}
	// Vercel serverless. One connection per invocation, fast release, no
	// prepared statements (transaction pooler).
	return postgres(activeUrl, {
		prepare: false,
		max: 1,
		idle_timeout: 20,
		connect_timeout: 10
	});
}

export const queryClient = globalThis.__pgQueryClient ?? buildClient();
if (env.NODE_ENV !== 'production') {
	globalThis.__pgQueryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
