import { defineConfig } from 'drizzle-kit';

try {
	process.loadEnvFile();
} catch {}

export default defineConfig({
	schema: './src/lib/server/db/schema/index.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		// Migrations run DDL (CREATE TYPE / ALTER TABLE …) and MUST use a session /
		// direct connection — never the transaction pooler (:6543), which pins a
		// backend only per-statement and breaks multi-statement DDL. DATABASE_URL is
		// the app's transaction-pooler URL, so prefer an explicit direct URL, then
		// the worker's session connection (:5432), and only fall back to DATABASE_URL.
		url:
			process.env.MIGRATION_DATABASE_URL ??
			process.env.WORKER_DATABASE_URL ??
			process.env.DATABASE_URL ??
			''
	}
});
