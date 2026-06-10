import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const env = process.env;

// Runtime detection. The worker process (worker.ts) sets WORKER_RUNTIME=true
// BEFORE importing anything else, so this evaluates correctly at module load.
const isWorker = env.WORKER_RUNTIME === 'true';

// Singleton across HMR / re-imports in the same process.
declare global {
	// eslint-disable-next-line no-var
	var __pgQueryClient: ReturnType<typeof postgres> | undefined;
}

function buildClient(): ReturnType<typeof postgres> {
	const databaseUrl = env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is required.');
	}

	// Worker may use a direct Postgres connection (port 5432) for prepared-statement
	// support + better long-lived perf. Falls back to DATABASE_URL otherwise.
	const activeUrl = isWorker ? env.WORKER_DATABASE_URL || databaseUrl : databaseUrl;

	// Detect Supabase transaction pooler (PgBouncer) — it does NOT support
	// prepared statements. Using `prepare: true` against it causes intermittent
	// silent failures and rolled-back transactions.
	const isPooler = activeUrl.includes(':6543');

	// Both the app (long-lived Node process on the VPS) and the worker are
	// long-running — pool properly. Prefer a direct/session connection (5432)
	// for prepared statements; on the transaction pooler (6543) force
	// prepare:false to avoid the PgBouncer prepared-statement bug.
	return postgres(activeUrl, {
		prepare: !isPooler,
		max: isPooler ? 5 : 10,
		idle_timeout: 60,
		connect_timeout: 10
	});
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | undefined;

// Lazy construction: SvelteKit's postbuild analyse imports this module with no
// .env loaded, and the Docker build stage carries no secrets. Deferring to
// first use keeps "DATABASE_URL is required" a runtime error, not a build one.
function getDb(): Db {
	if (_db) return _db;
	const client = globalThis.__pgQueryClient ?? buildClient();
	if (env.NODE_ENV !== 'production') {
		globalThis.__pgQueryClient = client;
	}
	_db = drizzle(client, { schema });
	return _db;
}

export const db: Db = new Proxy({} as Db, {
	get(_target, prop) {
		const real = getDb();
		const value = Reflect.get(real as object, prop);
		return typeof value === 'function'
			? (value as (...args: unknown[]) => unknown).bind(real)
			: value;
	}
});
