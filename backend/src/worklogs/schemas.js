const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = ['REMITTED', 'UNREMITTED'];

/**
 * Validates and normalises the GET /worklogs query parameters.
 * @param {object} query - Express req.query
 * @returns {{ remittanceStatus: string|null, userId: string|null, periodStart: string|null, periodEnd: string|null }}
 */
function validateWorklogQuery(query) {
  const { remittance_status, user_id, period_start, period_end } = query || {};

  let remittanceStatus = null;
  if (remittance_status) {
    const upper = remittance_status.toUpperCase();
    if (!VALID_STATUSES.includes(upper)) {
      throw new Error(`remittance_status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    remittanceStatus = upper;
  }

  if (period_start && !DATE_RE.test(period_start)) {
    throw new Error('period_start must be YYYY-MM-DD');
  }
  if (period_end && !DATE_RE.test(period_end)) {
    throw new Error('period_end must be YYYY-MM-DD');
  }

  return {
    remittanceStatus,
    userId: user_id || null,
    periodStart: period_start || null,
    periodEnd: period_end || null,
  };
}

module.exports = { validateWorklogQuery };
