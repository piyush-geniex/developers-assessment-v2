const fs = require('fs');
const path = require('path');
const db = require('./pool');

/**
 * Resolves the path to the seed file.
 * In Docker the seed dir is at /app/seed; locally it's at repo root.
 * @returns {string}
 */
function resolveSeedPath() {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'seed', 'worklogs.json'),  // local dev
    path.join('/app', 'seed', 'worklogs.json'),                        // docker
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Seeds the database with worklogs, segments, and adjustments from the JSON file.
 * Skips silently if data already exists or the seed file is missing.
 */
async function seed() {
  const existing = await db.query('SELECT COUNT(*)::int AS cnt FROM worklog');
  if (existing.rows[0].cnt > 0) {
    console.log('[seed] Data already present — skipping.');
    return;
  }

  const seedPath = resolveSeedPath();
  if (!seedPath) {
    console.warn('[seed] No seed file found — skipping.');
    return;
  }

  const raw = fs.readFileSync(seedPath, 'utf8');
  const worklogs = JSON.parse(raw);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    for (const wl of worklogs) {
      await client.query(
        `INSERT INTO worklog (worklog_id, user_id, user_name, task_name, hourly_rate)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (worklog_id) DO NOTHING`,
        [wl.worklog_id, wl.user_id, wl.user_name, wl.task_name, wl.hourly_rate]
      );

      for (const seg of wl.segments || []) {
        await client.query(
          `INSERT INTO time_segment (segment_id, worklog_id, start_time, end_time, status, dispute_reason)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (segment_id) DO NOTHING`,
          [seg.segment_id, wl.worklog_id, seg.start, seg.end, seg.status, seg.dispute_reason || null]
        );
      }

      for (const adj of wl.adjustments || []) {
        await client.query(
          `INSERT INTO adjustment (adjustment_id, worklog_id, amount, reason, applied_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (adjustment_id) DO NOTHING`,
          [adj.adjustment_id, wl.worklog_id, adj.amount, adj.reason, adj.applied_at]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[seed] Loaded ${worklogs.length} worklogs.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { seed };
