import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const sql = postgres(url, { prepare: false, max: 1 });

console.log('=== ACTIVE / IDLE-IN-TX SESSIONS ===');
const acts = await sql`
  SELECT pid, state, wait_event_type, wait_event,
         age(now(), xact_start) AS xact_age,
         age(now(), query_start) AS query_age,
         left(query, 120) AS query
  FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
  ORDER BY xact_start NULLS LAST`;
for (const a of acts) console.log(a);

console.log('\n=== BLOCKING LOCKS ===');
const blocks = await sql`
  SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
         left(blocking_act.query, 100) AS blocking_query,
         blocking_act.state AS blocking_state
  FROM pg_locks blocked
  JOIN pg_locks blocking
    ON blocking.locktype = blocked.locktype
   AND blocking.database IS NOT DISTINCT FROM blocked.database
   AND blocking.relation IS NOT DISTINCT FROM blocked.relation
   AND blocking.page IS NOT DISTINCT FROM blocked.page
   AND blocking.tuple IS NOT DISTINCT FROM blocked.tuple
   AND blocking.transactionid IS NOT DISTINCT FROM blocked.transactionid
   AND blocking.pid <> blocked.pid
  JOIN pg_stat_activity blocking_act ON blocking_act.pid = blocking.pid
  WHERE NOT blocked.granted`;
for (const b of blocks) console.log(b);

await sql.end();
