/**
 * One-off DEV/DEMO data wipe.
 * Clears all business/transactional data while preserving org identity, team
 * members, login, and org configuration (templates, pipeline stages, booking,
 * integrations). Schema and Drizzle journal are untouched.
 *
 * Run: node --env-file=.env --import tsx scripts/wipe-demo-data.ts
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');

const TABLES_TO_CLEAR = [
	// contacts
	'contacts',
	'contact_addresses',
	'contact_notes',
	'contact_imports',
	// pipeline
	'opportunities',
	'opportunity_follow_ups',
	// jobs
	'jobs',
	// communication
	'conversations',
	'messages',
	'inbound_communication_events',
	// revenue
	'quotes',
	'quote_line_items',
	'quote_views',
	'quote_change_requests',
	'invoices',
	'invoice_line_items',
	'invoice_views',
	'payments',
	// appointments
	'appointments',
	'appointment_assignees',
	// reputation
	'review_requests',
	'reviews',
	'private_feedback',
	'review_events',
	// webchat / messenger runtime
	'webchat_sessions',
	'messenger_contacts',
	// media
	'media',
	// system
	'growth_feed_items',
	'internal_activity_log',
	'automation_jobs',
	'outbox_events',
	'org_counters'
];

const sql = postgres(url, { prepare: !url.includes(':6543'), max: 2 });

try {
	const list = TABLES_TO_CLEAR.map((t) => `"${t}"`).join(', ');
	await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY`);
	console.log(`Cleared ${TABLES_TO_CLEAR.length} tables:`);
	console.log(TABLES_TO_CLEAR.join(', '));
} catch (e) {
	console.error('Wipe failed:', e instanceof Error ? e.message : e);
	process.exitCode = 1;
} finally {
	await sql.end();
}
