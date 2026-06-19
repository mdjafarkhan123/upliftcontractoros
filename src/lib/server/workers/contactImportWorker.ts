import { Worker, type Job } from 'bullmq';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	contacts,
	contactImports,
	outboxEvents,
	type ContactImportErrorRow
} from '$lib/server/db/schema';
import {
	CONTACT_IMPORT_QUEUE,
	CONTACT_IMPORT_JOB,
	redisConnection
} from '$lib/server/queue/bullmq';
import { organizations, contactAddresses } from '$lib/server/db/schema';
import { r2Get } from '$lib/server/media/r2';
import {
	parseCSV,
	normalizeKey,
	buildFieldIndex,
	resolveFullName
} from '$lib/server/contacts/csvImport';
import { toE164Loose } from '$lib/utils/phone';
import { createLogger } from '$lib/server/log';

const env = process.env;
const log = createLogger('contact-import.worker');

// Fixed, throughput-oriented batch size — the industry pattern (Jobber/HubSpot
// import in big chunks). A 10k file is 20 round-trips, not 10k. We deliberately do
// NOT shrink the batch to get a smoother progress bar: that earlier trick degraded
// to batch-size-1 (one round-trip per contact) on small files. The "Working…"
// indeterminate bar already covers the brief window before the first batch commits,
// and updates are now a single set-based statement (Stage 1), so per-row work is gone.
const BATCH_SIZE = 500;

type LeadSource =
	| 'website_form'
	| 'live_chat'
	| 'missed_call'
	| 'manual'
	| 'referral'
	| 'google_ads'
	| 'yelp'
	| 'angi'
	| 'facebook'
	| 'nextdoor'
	| 'door_hanger'
	| 'job_sign'
	| 'repeat_customer'
	| 'other';

const VALID_LEAD_SOURCES = new Set<string>([
	'website_form',
	'live_chat',
	'missed_call',
	'manual',
	'referral',
	'google_ads',
	'yelp',
	'angi',
	'facebook',
	'nextdoor',
	'door_hanger',
	'job_sign',
	'repeat_customer',
	'other'
]);

const VALID_STATUSES = new Set(['lead', 'customer', 'archived']);

type ContactImportJobData = { importId: string; orgId: string };

type InsertRow = {
	org_id: string;
	full_name: string;
	company_name: string | null;
	phone: string | null;
	alt_phone: string | null;
	email: string | null;
	status: 'lead' | 'customer' | 'archived';
	lead_source: LeadSource;
	tags: string[];
	notes: string | null;
};

// An overwrite of an existing contact (update mode). Only the CSV-provided fields
// are present, so untouched columns keep their current values.
type UpdateRow = {
	id: string;
	fields: {
		full_name?: string;
		company_name?: string | null;
		phone?: string;
		alt_phone?: string;
		email?: string;
		status?: 'lead' | 'customer' | 'archived';
		lead_source?: LeadSource;
		tags?: string[];
		notes?: string;
	};
};

// A primary service address to create alongside the contact, when the CSV carries
// a complete flat address. Aligned by index with the contact insert batch.
type PendingAddress = {
	address_line_1: string;
	address_line_2: string | null;
	city: string;
	state: string;
	zip: string;
} | null;

/**
 * Background contact-import processor. Downloads the raw CSV that the upload route
 * stashed in R2, normalizes each row (same rules as the old single-shot endpoint),
 * and inserts contacts in batches while keeping the contact_imports row's progress
 * counters current for the Realtime UI.
 *
 * IMPORTANT: imported contacts are inserted with a plain `db.insert` and NO outbox
 * automation event. Emitting `contact.created` here would fire speed_to_lead and
 * blast SMS to every imported contact (TCPA + Twilio spend disaster). This is a
 * locked design decision — do not add automation events to this path.
 *
 * Idempotency / resume: counters advance in the SAME transaction as each batch
 * insert, so a crash + BullMQ retry resumes from `processed_rows` and never
 * double-inserts. Phone dedup also re-derives from the org's live phone set, so a
 * partially-imported file won't re-add already-stored numbers.
 */
async function processImport(job: Job<ContactImportJobData>): Promise<void> {
	const { importId, orgId } = job.data;
	if (!importId || !orgId) {
		log.warn({ phase: 'bad_payload', import_id: importId });
		return;
	}

	const [imp] = await db
		.select()
		.from(contactImports)
		.where(eq(contactImports.id, importId))
		.limit(1);

	if (!imp || imp.org_id !== orgId) {
		log.warn({ phase: 'not_found', import_id: importId });
		return;
	}

	// Already-terminal: nothing to do (idempotent against duplicate jobs/retries).
	if (imp.status === 'completed' || imp.status === 'cancelled' || imp.status === 'failed') {
		return;
	}

	// User cancelled before the worker picked it up.
	if (imp.status === 'cancelling') {
		await db
			.update(contactImports)
			.set({ status: 'cancelled', completed_at: new Date(), updated_at: new Date() })
			.where(eq(contactImports.id, importId));
		log.info({ phase: 'cancelled_before_start', import_id: importId });
		return;
	}

	// pending → start; processing → resume a prior crashed attempt.
	await db
		.update(contactImports)
		.set({ status: 'processing', updated_at: new Date() })
		.where(eq(contactImports.id, importId));

	const bytes = await r2Get(imp.file_key);
	const allRows = parseCSV(bytes.toString('utf-8'));
	const dataRows = allRows.length >= 1 ? allRows.slice(1) : [];
	const BATCH = BATCH_SIZE;
	const headerRow = (allRows[0] ?? []).map(normalizeKey);
	const fieldIndex = buildFieldIndex(headerRow);

	if (!('full_name' in fieldIndex) && !('first_name' in fieldIndex)) {
		// Validated at upload time, so reaching here means a corrupt/edited file.
		throw new Error('CSV is missing a required name column.');
	}

	const get = (row: string[], field: string): string => {
		const idx = fieldIndex[field];
		return idx !== undefined ? (row[idx] ?? '').trim() : '';
	};

	// Default country for national-format phone numbers (e.g. "738-551-9969").
	// libphonenumber expects an ISO country; the org's onboarding country is the
	// natural default, falling back to US.
	const [org] = await db
		.select({ country: organizations.country })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	const defaultCountry = (org?.country || 'US').toUpperCase();

	// How to treat a row that matches an existing contact (chosen on the import screen).
	const onDuplicate = imp.on_duplicate; // 'skip' | 'update'

	// Live dedup index — includes anything inserted on a prior attempt. We match a row
	// to an existing contact on phone OR email (industry standard; phone alone missed
	// phone-less duplicates). Maps carry the contact id so update mode can target it.
	const existingRows = await db
		.select({ id: contacts.id, phone: contacts.phone, email: contacts.email })
		.from(contacts)
		.where(eq(contacts.org_id, orgId));
	const phoneToId = new Map<string, string>();
	const emailToId = new Map<string, string>();
	for (const r of existingRows) {
		if (r.phone && !phoneToId.has(r.phone)) phoneToId.set(r.phone, r.id);
		const ek = r.email?.trim().toLowerCase();
		if (ek && !emailToId.has(ek)) emailToId.set(ek, r.id);
	}
	// New phones/emails queued for insert in THIS run — blocks creating a second copy
	// of a contact that appears twice in the same file.
	const seenPhones = new Set<string>();
	const seenEmails = new Set<string>();

	// Resume from the last persisted point; accumulate onto the persisted counters.
	let processed = imp.processed_rows;
	let imported = imp.imported;
	let updated = imp.updated;
	let skipped = imp.skipped;
	let failed = imp.failed;
	const errorRows: ContactImportErrorRow[] = Array.isArray(imp.error_rows)
		? [...(imp.error_rows as ContactImportErrorRow[])]
		: [];

	for (let start = processed; start < dataRows.length; start += BATCH) {
		// Honor a cancel requested mid-run (between batches only).
		const [cur] = await db
			.select({ status: contactImports.status })
			.from(contactImports)
			.where(eq(contactImports.id, importId))
			.limit(1);
		if (!cur || cur.status === 'cancelling') {
			await db
				.update(contactImports)
				.set({
					status: 'cancelled',
					completed_at: new Date(),
					processed_rows: processed,
					imported,
					updated,
					skipped,
					failed,
					error_rows: errorRows,
					updated_at: new Date()
				})
				.where(eq(contactImports.id, importId));
			log.info({ phase: 'cancelled', import_id: importId, processed });
			return;
		}

		const end = Math.min(start + BATCH, dataRows.length);
		const toInsert: InsertRow[] = [];
		// Aligned 1:1 with toInsert — addresses[k] belongs to the contact toInsert[k].
		const addresses: PendingAddress[] = [];
		// Existing contacts to overwrite (update mode only).
		const toUpdate: UpdateRow[] = [];

		for (let i = start; i < end; i++) {
			const r = dataRows[i];
			const rowNum = i + 2; // +1 for header, +1 for 1-based display

			const full_name = resolveFullName(r, fieldIndex);
			if (!full_name) {
				errorRows.push({ row: rowNum, reason: 'Missing name' });
				failed++;
				continue;
			}

			// Phone is parsed against the org's country so national formats work.
			// An invalid/unparseable number does NOT drop the contact — we import it
			// without a phone and flag the row so the user can fix it later.
			let phone: string | null = null;
			const rawPhone = get(r, 'phone');
			let phoneInvalid = false;
			if (rawPhone) {
				phone = toE164Loose(rawPhone, defaultCountry);
				if (!phone) phoneInvalid = true;
			}

			const rawEmail = get(r, 'email');
			const email = rawEmail || null;
			const emailKey = rawEmail ? rawEmail.toLowerCase() : null;

			// Match against an existing contact on phone OR email. Phone wins when both
			// point somewhere, but either is enough to call it the same person.
			const matchId =
				(phone ? phoneToId.get(phone) : undefined) ??
				(emailKey ? emailToId.get(emailKey) : undefined);

			if (matchId) {
				if (onDuplicate === 'skip') {
					skipped++;
					continue;
				}
				// update mode: overwrite only the fields the CSV actually provides.
				if (phoneInvalid) {
					errorRows.push({
						row: rowNum,
						reason: `Phone "${rawPhone}" isn't a valid number — left unchanged`
					});
				}
				const fields: UpdateRow['fields'] = { full_name };

				const company = get(r, 'company_name');
				if (company) fields.company_name = company;

				// Never reassign a phone already owned by a different contact — it would
				// violate UNIQUE(org_id, phone) and abort the whole batch transaction.
				if (phone) {
					const owner = phoneToId.get(phone);
					if (!owner || owner === matchId) {
						fields.phone = phone;
						phoneToId.set(phone, matchId);
					} else {
						errorRows.push({
							row: rowNum,
							reason: `Phone "${phone}" already belongs to another contact — left unchanged`
						});
					}
				}

				const rawAlt = get(r, 'alt_phone');
				if (rawAlt) {
					const parsedAlt = toE164Loose(rawAlt, defaultCountry);
					if (parsedAlt) fields.alt_phone = parsedAlt;
				}

				if (email) {
					fields.email = email;
					if (emailKey) emailToId.set(emailKey, matchId);
				}

				const rawStatus = get(r, 'status').toLowerCase();
				if (VALID_STATUSES.has(rawStatus))
					fields.status = rawStatus as 'lead' | 'customer' | 'archived';

				const rawSource = get(r, 'lead_source')
					.toLowerCase()
					.replace(/[\s-]+/g, '_');
				if (VALID_LEAD_SOURCES.has(rawSource)) fields.lead_source = rawSource as LeadSource;

				const rawTags = get(r, 'tags');
				if (rawTags) {
					fields.tags = rawTags
						.split(/[|,]/)
						.map((t) => t.trim())
						.filter(Boolean);
				}

				const notes = get(r, 'notes');
				if (notes) fields.notes = notes;

				toUpdate.push({ id: matchId, fields });
				updated++;
				continue;
			}

			// No existing match — but guard against a duplicate that appears twice
			// within this same file (only the first occurrence is inserted).
			if ((phone && seenPhones.has(phone)) || (emailKey && seenEmails.has(emailKey))) {
				skipped++;
				continue;
			}

			if (phoneInvalid) {
				errorRows.push({
					row: rowNum,
					reason: `Phone "${rawPhone}" isn't a valid number — imported without a phone`
				});
			}
			if (phone) seenPhones.add(phone);
			if (emailKey) seenEmails.add(emailKey);

			const rawAlt = get(r, 'alt_phone');
			const alt_phone: string | null = rawAlt ? toE164Loose(rawAlt, defaultCountry) : null;

			const rawStatus = get(r, 'status').toLowerCase();
			const status = VALID_STATUSES.has(rawStatus)
				? (rawStatus as 'lead' | 'customer' | 'archived')
				: 'lead';

			const rawSource = get(r, 'lead_source')
				.toLowerCase()
				.replace(/[\s-]+/g, '_');
			const lead_source: LeadSource = VALID_LEAD_SOURCES.has(rawSource)
				? (rawSource as LeadSource)
				: 'manual';

			const rawTags = get(r, 'tags');
			const tags = rawTags
				? rawTags
						.split(/[|,]/)
						.map((t) => t.trim())
						.filter(Boolean)
				: [];

			toInsert.push({
				org_id: orgId,
				full_name,
				company_name: get(r, 'company_name') || null,
				phone,
				alt_phone,
				email,
				status,
				lead_source,
				tags,
				notes: get(r, 'notes') || null
			});

			// A primary service address is created only when the full set is present
			// (the table requires line1/city/state/zip). Partial addresses are dropped.
			const line1 = get(r, 'address_line_1');
			const city = get(r, 'city');
			const state = get(r, 'state');
			const zip = get(r, 'zip');
			addresses.push(
				line1 && city && state && zip
					? {
							address_line_1: line1,
							address_line_2: get(r, 'address_line_2') || null,
							city,
							state,
							zip
						}
					: null
			);
		}

		processed = end;

		// Atomic: insert batch + addresses + advance counters together, so a crash
		// between any of them can't desync — a retry resumes from processed_rows.
		await db.transaction(async (tx) => {
			if (toInsert.length > 0) {
				const inserted = await tx.insert(contacts).values(toInsert).returning({ id: contacts.id });
				imported += inserted.length;

				// Map each created contact id back to its pending address by index.
				const addrRows = inserted
					.map((c, k) => {
						const a = addresses[k];
						return a
							? {
									org_id: orgId,
									contact_id: c.id,
									label: 'service' as const,
									is_primary: true,
									...a
								}
							: null;
					})
					.filter((a): a is NonNullable<typeof a> => a !== null);
				if (addrRows.length > 0) {
					await tx.insert(contactAddresses).values(addrRows);
				}
			}

			// Apply update-mode overwrites as ONE set-based statement per batch
			// instead of one UPDATE round-trip per matched row (the pooler made the
			// per-row loop ~100ms × N). Each VALUES row carries every column; a field
			// the CSV didn't provide is NULL, and COALESCE(v.col, c.col) keeps the
			// existing value — so "only overwrite provided fields" falls straight out
			// of the NULLs. Every column is cast explicitly because Postgres infers
			// VALUES types from the first row (and enums/arrays need the exact type).
			if (toUpdate.length > 0) {
				const valueRows = toUpdate.map((u) => {
					const f = u.fields;
					// Build tags as a real ARRAY[...] of scalar text params (NULL when the
					// CSV didn't provide tags) — passing a JS array straight through a raw
					// VALUES param is the one fragile spot, so we sidestep it entirely.
					const tagsSql =
						f.tags === undefined
							? sql`NULL::text[]`
							: sql`ARRAY[${sql.join(
									f.tags.map((t) => sql`${t}::text`),
									sql`, `
								)}]::text[]`;
					return sql`(${u.id}::uuid, ${f.full_name ?? null}::text, ${f.company_name ?? null}::text, ${f.phone ?? null}::text, ${f.alt_phone ?? null}::text, ${f.email ?? null}::text, ${f.status ?? null}::contact_status, ${f.lead_source ?? null}::lead_source_type, ${tagsSql}, ${f.notes ?? null}::text)`;
				});
				// updated_at is set with now() in the SET clause rather than carried per
				// row — postgres-js serializes a raw JS Date via Date.toString(), which
				// Postgres rejects as a timestamptz (the Stage-1 import bug). All matched
				// rows are "updated now" anyway, so now() is both correct and simpler.
				await tx.execute(sql`
					UPDATE contacts AS c SET
						full_name = COALESCE(v.full_name, c.full_name),
						company_name = COALESCE(v.company_name, c.company_name),
						phone = COALESCE(v.phone, c.phone),
						alt_phone = COALESCE(v.alt_phone, c.alt_phone),
						email = COALESCE(v.email, c.email),
						status = COALESCE(v.status, c.status),
						lead_source = COALESCE(v.lead_source, c.lead_source),
						tags = COALESCE(v.tags, c.tags),
						notes = COALESCE(v.notes, c.notes),
						updated_at = now()
					FROM (VALUES ${sql.join(valueRows, sql`, `)}) AS v(id, full_name, company_name, phone, alt_phone, email, status, lead_source, tags, notes)
					WHERE c.id = v.id AND c.org_id = ${orgId}
				`);
			}

			await tx
				.update(contactImports)
				.set({
					processed_rows: processed,
					imported,
					updated,
					skipped,
					failed,
					error_rows: errorRows,
					updated_at: new Date()
				})
				.where(eq(contactImports.id, importId));
		});
	}

	// Finalize + announce in one transaction (transaction boundary law): the
	// completion and the outbox event commit together, so the "import finished"
	// notification can never be lost or fire without the import actually completing.
	// The notification fans out to the uploader only (see notificationWorker).
	await db.transaction(async (tx) => {
		await tx
			.update(contactImports)
			.set({
				status: 'completed',
				completed_at: new Date(),
				processed_rows: processed,
				imported,
				updated,
				skipped,
				failed,
				error_rows: errorRows,
				updated_at: new Date()
			})
			.where(eq(contactImports.id, importId));

		await tx
			.insert(outboxEvents)
			.values({
				org_id: orgId,
				event_type: 'contact_import.finished',
				resource_type: 'contact_import',
				resource_id: importId,
				payload: {
					event_version: 1,
					import_id: importId,
					org_id: orgId,
					uploaded_by: imp.uploaded_by,
					file_name: imp.file_name,
					status: 'completed',
					imported,
					updated,
					skipped,
					failed
				},
				// One terminal event per import — guards against a resumed/retried run
				// emitting a second completion notification.
				idempotency_key: `contact_import.finished:${importId}`
			})
			.onConflictDoNothing({ target: outboxEvents.idempotency_key });
	});

	log.info({ phase: 'completed', import_id: importId, imported, updated, skipped, failed });
}

export const contactImportWorker = new Worker<ContactImportJobData>(
	CONTACT_IMPORT_QUEUE,
	async (job) => {
		if (job.name !== CONTACT_IMPORT_JOB) {
			log.warn({ phase: 'unknown_job', name: job.name });
			return;
		}
		await processImport(job);
	},
	{
		connection: redisConnection(),
		// One import at a time per worker: each is large and DB-write-heavy, and the
		// resume logic assumes a single processor per import row.
		concurrency: Number(env.CONTACT_IMPORT_WORKER_CONCURRENCY ?? '1')
	}
);

contactImportWorker.on('failed', async (job, err) => {
	console.error(`[contact-import] job ${job?.id} failed:`, err.message);
	if (!job) return;

	// Only flag the import as failed once BullMQ has exhausted its retries — earlier
	// failures should leave it 'processing' so the next attempt can resume.
	const attempts = job.opts.attempts ?? 1;
	if (job.attemptsMade < attempts) return;

	const { importId, orgId } = job.data;
	if (!importId || !orgId) return;
	try {
		await db.transaction(async (tx) => {
			// Returning tells us whether THIS call actually flipped the row to failed
			// (vs a concurrent path that already finalized it) — only then do we notify,
			// so a cancelled/completed import never gets a spurious "failed" alert.
			const [failedRow] = await tx
				.update(contactImports)
				.set({
					status: 'failed',
					last_error: err.message.slice(0, 500),
					completed_at: new Date(),
					updated_at: new Date()
				})
				.where(
					and(
						eq(contactImports.id, importId),
						eq(contactImports.org_id, orgId),
						// Don't clobber a row a concurrent path already finalized.
						inArray(contactImports.status, ['pending', 'processing'])
					)
				)
				.returning({
					uploaded_by: contactImports.uploaded_by,
					file_name: contactImports.file_name
				});

			if (!failedRow) return;

			await tx
				.insert(outboxEvents)
				.values({
					org_id: orgId,
					event_type: 'contact_import.finished',
					resource_type: 'contact_import',
					resource_id: importId,
					payload: {
						event_version: 1,
						import_id: importId,
						org_id: orgId,
						uploaded_by: failedRow.uploaded_by,
						file_name: failedRow.file_name,
						status: 'failed'
					},
					idempotency_key: `contact_import.finished:${importId}`
				})
				.onConflictDoNothing({ target: outboxEvents.idempotency_key });
		});
	} catch (e) {
		console.error('[contact-import] could not mark import failed:', e);
	}
});
