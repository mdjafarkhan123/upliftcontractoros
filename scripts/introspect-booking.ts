import { readFileSync } from 'node:fs';
import postgres from 'postgres';

// Minimal .env loader (avoids dotenv dependency)
try {
	const env = readFileSync('.env', 'utf8');
	for (const line of env.split('\n')) {
		const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
		if (m && !process.env[m[1]]) {
			let v = m[2].trim();
			if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
				v = v.slice(1, -1);
			process.env[m[1]] = v;
		}
	}
} catch {}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

const sql = postgres(url, { prepare: false, max: 1 });

const TABLES = ['booking_links', 'availability_windows', 'availability_overrides'];

async function main() {
	const out: string[] = [];

	// 1. Enum: booking_source
	const enums = await sql<{ typname: string; labels: string[] }[]>`
		SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
		FROM pg_type t
		JOIN pg_enum e ON e.enumtypid = t.oid
		WHERE t.typname = 'booking_source'
		GROUP BY t.typname
	`;
	out.push('-- =============================================================================');
	out.push('-- BOOKING SCHEMA — generated from live database introspection');
	out.push('-- Source of truth: live Supabase database');
	out.push('-- =============================================================================');
	out.push('');
	for (const e of enums) {
		const labels = e.labels.map((l) => `'${l}'`).join(', ');
		out.push(`CREATE TYPE ${e.typname} AS ENUM (${labels});`);
		out.push('');
	}

	// 2. Tables: columns
	for (const tbl of TABLES) {
		const cols = await sql<
			{
				column_name: string;
				data_type: string;
				udt_name: string;
				is_nullable: string;
				column_default: string | null;
				character_maximum_length: number | null;
				numeric_precision: number | null;
				numeric_scale: number | null;
			}[]
		>`
			SELECT column_name, data_type, udt_name, is_nullable, column_default,
				character_maximum_length, numeric_precision, numeric_scale
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = ${tbl}
			ORDER BY ordinal_position
		`;
		if (cols.length === 0) {
			out.push(`-- TABLE ${tbl} NOT FOUND`);
			out.push('');
			continue;
		}
		out.push(`CREATE TABLE ${tbl} (`);
		const colDefs: string[] = [];
		for (const c of cols) {
			let type = c.udt_name;
			// Map common udt_names back to canonical SQL types
			const typeMap: Record<string, string> = {
				int4: 'integer',
				int8: 'bigint',
				int2: 'smallint',
				bool: 'boolean',
				varchar: 'text',
				bpchar: 'char',
				timestamptz: 'timestamptz',
				timestamp: 'timestamp',
				float4: 'real',
				float8: 'double precision'
			};
			if (typeMap[type]) type = typeMap[type];
			if (type === 'numeric' && c.numeric_precision)
				type = `numeric(${c.numeric_precision}${c.numeric_scale ? `, ${c.numeric_scale}` : ''})`;
			if (type === 'text' && c.character_maximum_length)
				type = `varchar(${c.character_maximum_length})`;

			let line = `  ${c.column_name} ${type}`;
			if (c.is_nullable === 'NO') line += ' NOT NULL';
			if (c.column_default !== null) line += ` DEFAULT ${c.column_default}`;
			colDefs.push(line);
		}
		out.push(colDefs.join(',\n'));
		out.push(');');
		out.push('');

		// 3. Constraints (PK, FK, UNIQUE, CHECK)
		const constraints = await sql<{ conname: string; def: string }[]>`
			SELECT conname, pg_get_constraintdef(oid) AS def
			FROM pg_constraint
			WHERE conrelid = ${`public.${tbl}`}::regclass
			ORDER BY contype, conname
		`;
		for (const con of constraints) {
			out.push(`ALTER TABLE ${tbl} ADD CONSTRAINT ${con.conname} ${con.def};`);
		}
		if (constraints.length) out.push('');

		// 4. Indexes (excluding ones backing PK/UNIQUE constraints)
		const indexes = await sql<{ indexname: string; indexdef: string }[]>`
			SELECT indexname, indexdef
			FROM pg_indexes
			WHERE schemaname = 'public' AND tablename = ${tbl}
			ORDER BY indexname
		`;
		for (const idx of indexes) {
			out.push(`${idx.indexdef};`);
		}
		if (indexes.length) out.push('');
	}

	// 5. New columns on organizations
	out.push('-- =============================================================================');
	out.push('-- ALTER organizations — feature_online_booking');
	out.push('-- =============================================================================');
	const orgCols = await sql<
		{
			column_name: string;
			data_type: string;
			udt_name: string;
			is_nullable: string;
			column_default: string | null;
		}[]
	>`
		SELECT column_name, data_type, udt_name, is_nullable, column_default
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'organizations'
			AND column_name = 'feature_online_booking'
	`;
	for (const c of orgCols) {
		let type = c.udt_name === 'bool' ? 'boolean' : c.udt_name;
		let line = `ALTER TABLE organizations ADD COLUMN ${c.column_name} ${type}`;
		if (c.is_nullable === 'NO') line += ' NOT NULL';
		if (c.column_default !== null) line += ` DEFAULT ${c.column_default}`;
		out.push(line + ';');
	}
	if (!orgCols.length) out.push('-- feature_online_booking column NOT FOUND on organizations');
	out.push('');

	// 6. New columns on appointments
	out.push('-- =============================================================================');
	out.push('-- ALTER appointments — booking attribution columns');
	out.push('-- =============================================================================');
	// Get all current appointments columns; compare against the Drizzle schema baseline
	const KNOWN_APPT_COLS = new Set([
		'id',
		'org_id',
		'contact_id',
		'job_id',
		'assigned_to',
		'type',
		'status',
		'title',
		'scheduled_start',
		'scheduled_end',
		'location',
		'notes',
		'reminder_24h_sent',
		'reminder_1h_sent',
		'cancelled_at',
		'deleted_at',
		'created_at',
		'updated_at'
	]);
	const apptCols = await sql<
		{
			column_name: string;
			data_type: string;
			udt_name: string;
			is_nullable: string;
			column_default: string | null;
			character_maximum_length: number | null;
		}[]
	>`
		SELECT column_name, data_type, udt_name, is_nullable, column_default,
			character_maximum_length
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'appointments'
		ORDER BY ordinal_position
	`;
	const newApptCols = apptCols.filter((c) => !KNOWN_APPT_COLS.has(c.column_name));
	for (const c of newApptCols) {
		let type = c.udt_name;
		const map: Record<string, string> = {
			int4: 'integer',
			bool: 'boolean',
			timestamptz: 'timestamptz'
		};
		if (map[type]) type = map[type];
		if (type === 'text' && c.character_maximum_length)
			type = `varchar(${c.character_maximum_length})`;
		let line = `ALTER TABLE appointments ADD COLUMN ${c.column_name} ${type}`;
		if (c.is_nullable === 'NO') line += ' NOT NULL';
		if (c.column_default !== null) line += ` DEFAULT ${c.column_default}`;
		out.push(line + ';');
	}
	if (!newApptCols.length) out.push('-- No new appointments columns detected');
	out.push('');

	// FK constraints on appointments involving booking_links
	const apptConstraints = await sql<{ conname: string; def: string }[]>`
		SELECT conname, pg_get_constraintdef(oid) AS def
		FROM pg_constraint
		WHERE conrelid = 'public.appointments'::regclass
			AND pg_get_constraintdef(oid) ILIKE '%booking_links%'
	`;
	for (const con of apptConstraints) {
		out.push(`ALTER TABLE appointments ADD CONSTRAINT ${con.conname} ${con.def};`);
	}

	console.log(out.join('\n'));
	await sql.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
