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

	// The worker keeps its own connection (WORKER_DATABASE_URL) — a small
	// session/direct pool is ideal for a single long-lived background process
	// that benefits from prepared statements. Falls back to DATABASE_URL.
	const activeUrl = isWorker ? env.WORKER_DATABASE_URL || databaseUrl : databaseUrl;

	// Supabase TRANSACTION pooler (Supavisor/PgBouncer) listens on :6543. It
	// multiplexes thousands of client connections onto a small shared pool of
	// real Postgres backends — the only mode that scales past `pool_size`
	// clients. It does NOT support session-level prepared statements, so we must
	// run `prepare:false` against it. The SESSION pooler (:5432) pins one real
	// backend per client for its whole life, so it hard-caps at `pool_size`
	// clients (the source of the EMAXCONNSESSION errors) — never point the web
	// app at it.
	const isTxnPooler = activeUrl.includes(':6543');

	return postgres(activeUrl, {
		// Session-level prepared statements are illegal on the transaction pooler.
		prepare: !isTxnPooler,
		// Client-side pool size. On the transaction pooler these are cheap,
		// multiplexed connections, so we size above a single request's parallel
		// wave (~12, Rule 24) plus headroom. The worker holds a small, long-lived
		// pool bounded by its BullMQ concurrency — keep it lean so it never
		// starves the shared backend pool.
		max: isWorker ? 4 : isTxnPooler ? 20 : 10,
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
