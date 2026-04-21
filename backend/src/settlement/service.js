const db = require('../database/pool');
const { AlreadySettledError } = require('./errors');

/**
 * Finds every distinct user_id that has billable work or adjustments
 * touching the given settlement period.
 *
 * A user qualifies if they have:
 *  - approved time segments whose start_time falls within the period, OR
 *  - adjustments whose applied_at falls within the period
 *
 * @param {string} periodStart - YYYY-MM-DD
 * @param {string} periodEnd   - YYYY-MM-DD
 * @returns {Promise<string[]>} list of user_ids
 */
async function findEligibleUsers(periodStart, periodEnd) {
  const res = await db.query(
    `SELECT DISTINCT w.user_id
     FROM worklog w
     WHERE EXISTS (
       SELECT 1 FROM time_segment ts
       WHERE ts.worklog_id = w.worklog_id
         AND ts.status = 'approved'
         AND ts.start_time >= $1
         AND ts.start_time < ($2::date + INTERVAL '1 day')
     )
     OR EXISTS (
       SELECT 1 FROM adjustment a
       WHERE a.worklog_id = w.worklog_id
         AND a.applied_at >= $1
         AND a.applied_at < ($2::date + INTERVAL '1 day')
     )`,
    [periodStart, periodEnd]
  );
  return res.rows.map(r => r.user_id);
}

/**
 * Gathers every worklog for a user that has approved segments or adjustments
 * within the period, and computes per-worklog amounts.
 *
 * @param {string} userId
 * @param {string} periodStart
 * @param {string} periodEnd
 * @returns {Promise<Array<{worklog_id: string, segmentAmount: number, adjustmentAmount: number, lineTotal: number}>>}
 */
async function computeUserLines(userId, periodStart, periodEnd) {
  const wlRes = await db.query(
    `SELECT DISTINCT w.worklog_id, w.hourly_rate
     FROM worklog w
     WHERE w.user_id = $1
       AND (
         EXISTS (
           SELECT 1 FROM time_segment ts
           WHERE ts.worklog_id = w.worklog_id
             AND ts.status = 'approved'
             AND ts.start_time >= $2
             AND ts.start_time < ($3::date + INTERVAL '1 day')
         )
         OR EXISTS (
           SELECT 1 FROM adjustment a
           WHERE a.worklog_id = w.worklog_id
             AND a.applied_at >= $2
             AND a.applied_at < ($3::date + INTERVAL '1 day')
         )
       )`,
    [userId, periodStart, periodEnd]
  );

  const lines = [];

  for (const wl of wlRes.rows) {
    const segRes = await db.query(
      `SELECT start_time, end_time
       FROM time_segment
       WHERE worklog_id = $1
         AND status = 'approved'
         AND start_time >= $2
         AND start_time < ($3::date + INTERVAL '1 day')`,
      [wl.worklog_id, periodStart, periodEnd]
    );

    const hours = segRes.rows.reduce((sum, seg) => {
      const ms = new Date(seg.end_time) - new Date(seg.start_time);
      return sum + Math.max(ms / 3_600_000, 0);
    }, 0);

    const segmentAmount = round2(hours * parseFloat(wl.hourly_rate));

    const adjRes = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM adjustment
       WHERE worklog_id = $1
         AND applied_at >= $2
         AND applied_at < ($3::date + INTERVAL '1 day')`,
      [wl.worklog_id, periodStart, periodEnd]
    );

    const adjustmentAmount = round2(parseFloat(adjRes.rows[0].total));
    const lineTotal = round2(segmentAmount + adjustmentAmount);

    lines.push({
      worklog_id: wl.worklog_id,
      segmentAmount,
      adjustmentAmount,
      lineTotal,
    });
  }

  return lines;
}

/**
 * Runs the full settlement for a single user within a transaction.
 * Returns the created remittance record or throws AlreadySettledError.
 *
 * @param {import('pg').PoolClient} client - transactional db client
 * @param {string} userId
 * @param {string} periodStart
 * @param {string} periodEnd
 * @param {Array} lines - pre-computed line items from computeUserLines
 * @returns {Promise<object>} the inserted remittance row
 */
async function settleUser(client, userId, periodStart, periodEnd, lines) {
  const grossAmount = round2(lines.reduce((s, l) => s + l.segmentAmount, 0));
  const adjustmentAmount = round2(lines.reduce((s, l) => s + l.adjustmentAmount, 0));
  const netAmount = round2(grossAmount + adjustmentAmount);

  let remittance;
  try {
    const res = await client.query(
      `INSERT INTO remittance (user_id, period_start, period_end, gross_amount, adjustment_amount, net_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [userId, periodStart, periodEnd, grossAmount, adjustmentAmount, netAmount]
    );
    remittance = res.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new AlreadySettledError(userId, periodStart, periodEnd);
    }
    throw err;
  }

  for (const line of lines) {
    await client.query(
      `INSERT INTO remittance_line (remittance_id, worklog_id, segment_amount, adjustment_amount, line_total)
       VALUES ($1, $2, $3, $4, $5)`,
      [remittance.id, line.worklog_id, line.segmentAmount, line.adjustmentAmount, line.lineTotal]
    );
  }

  return remittance;
}

/**
 * Top-level settlement run: processes all eligible users for the period.
 * Each user is settled independently so one failure doesn't block the rest.
 *
 * @param {string} periodStart - YYYY-MM-DD
 * @param {string} periodEnd   - YYYY-MM-DD
 * @returns {Promise<{succeeded: number, failed: number, remittances: object[], errors: object[]}>}
 */
async function generateRemittances(periodStart, periodEnd) {
  const userIds = await findEligibleUsers(periodStart, periodEnd);

  const results = { succeeded: 0, failed: 0, remittances: [], errors: [] };

  for (const userId of userIds) {
    const client = await db.getClient();
    try {
      const lines = await computeUserLines(userId, periodStart, periodEnd);

      if (lines.length === 0) continue;

      await client.query('BEGIN');
      const remittance = await settleUser(client, userId, periodStart, periodEnd, lines);
      await client.query('COMMIT');

      results.succeeded += 1;
      results.remittances.push(remittance);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[settlement] Failed for user ${userId}:`, err.message);
      results.failed += 1;
      results.errors.push({ user_id: userId, error: err.message });
    } finally {
      client.release();
    }
  }

  return results;
}

/**
 * Rounds a number to 2 decimal places.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { generateRemittances };
