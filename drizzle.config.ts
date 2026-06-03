import { defineConfig } from 'drizzle-kit';

try {
	process.loadEnvFile();
} catch {}

export default defineConfig({
	schema: './src/lib/server/db/schema/index.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	}
});
