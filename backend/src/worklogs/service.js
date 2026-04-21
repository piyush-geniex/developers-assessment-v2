const db = require('../database/pool');

/**
 * Lists worklogs with optional filtering and calculated amounts.
 *
 * Each worklog is returned with:
 *  - approved_hours: total hours from approved segments
 *  - segment_amount: hours × hourly_rate
 *  - adjustment_amount: sum of adjustments
 *  - total_amount: segment_amount + adjustment_amount
 *  - remittance_status: REMITTED if linked to a non-failed/cancelled remittance, else UNREMITTED
 *
 * @param {object} filters
 * @param {string|null} filters.remittanceStatus - REMITTED or UNREMITTED
 * @param {string|null} filters.userId
 * @param {string|null} filters.periodStart - YYYY-MM-DD
 * @param {string|null} filters.periodEnd   - YYYY-MM-DD
 * @returns {Promise<object[]>}
 */
async function listWorklogs(filters) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (filters.userId) {
    conditions.push(`w.user_id = $${idx++}`);
    params.push(filters.userId);
  }

  if (filters.periodStart) {
    conditions.push(`EXISTS (
      SELECT 1 FROM time_segment ts2
      WHERE ts2.worklog_id = w.worklog_id
        AND ts2.start_time >= $${idx++}
    )`);
    params.push(filters.periodStart);
  }

  if (filters.periodEnd) {
    conditions.push(`EXISTS (
      SELECT 1 FROM time_segment ts3
      WHERE ts3.worklog_id = w.worklog_id
        AND ts3.start_time < ($${idx++}::date + INTERVAL '1 day')
    )`);
    params.push(filters.periodEnd);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT
      w.worklog_id,
      w.user_id,
      w.user_name,
      w.task_name,
      w.hourly_rate,
      COALESCE(seg.approved_hours, 0)   AS approved_hours,
      COALESCE(adj.total_adjustment, 0) AS adjustment_total,
      CASE
        WHEN rl.remittance_id IS NOT NULL THEN 'REMITTED'
        ELSE 'UNREMITTED'
      END AS remittance_status,
      rl.remittance_id
    FROM worklog w
    LEFT JOIN LATERAL (
      SELECT
        SUM(EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 3600) AS approved_hours
      FROM time_segment ts
      WHERE ts.worklog_id = w.worklog_id
        AND ts.status = 'approved'
    ) seg ON true
    LEFT JOIN LATERAL (
      SELECT SUM(a.amount) AS total_adjustment
      FROM adjustment a
      WHERE a.worklog_id = w.worklog_id
    ) adj ON true
    LEFT JOIN LATERAL (
      SELECT rl2.remittance_id
      FROM remittance_line rl2
      JOIN remittance r ON r.id = rl2.remittance_id
      WHERE rl2.worklog_id = w.worklog_id
        AND r.status NOT IN ('failed', 'cancelled')
      LIMIT 1
    ) rl ON true
    ${where}
    ORDER BY w.worklog_id
  `;

  const res = await db.query(sql, params);

  let rows = res.rows.map(r => {
    const approvedHours = parseFloat(r.approved_hours) || 0;
    const rate = parseFloat(r.hourly_rate);
    const segmentAmount = round2(approvedHours * rate);
    const adjustmentAmount = round2(parseFloat(r.adjustment_total) || 0);
    const totalAmount = round2(segmentAmount + adjustmentAmount);

    return {
      worklog_id: r.worklog_id,
      user_id: r.user_id,
      user_name: r.user_name,
      task_name: r.task_name,
      hourly_rate: rate,
      approved_hours: round2(approvedHours),
      segment_amount: segmentAmount,
      adjustment_amount: adjustmentAmount,
      total_amount: totalAmount,
      remittance_status: r.remittance_status,
    };
  });

  if (filters.remittanceStatus) {
    rows = rows.filter(r => r.remittance_status === filters.remittanceStatus);
  }

  return rows;
}

/**
 * Rounds a number to 2 decimal places.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { listWorklogs };
