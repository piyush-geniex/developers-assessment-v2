const { InvalidPeriodError } = require('./errors');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and normalises the generate-remittances request body.
 * @param {object} body - raw request body
 * @returns {{ periodStart: string, periodEnd: string }}
 */
function validateGenerateRequest(body) {
  const { period_start, period_end } = body || {};

  if (!period_start || !DATE_RE.test(period_start)) {
    throw new InvalidPeriodError('period_start must be a date in YYYY-MM-DD format');
  }
  if (!period_end || !DATE_RE.test(period_end)) {
    throw new InvalidPeriodError('period_end must be a date in YYYY-MM-DD format');
  }
  if (period_start > period_end) {
    throw new InvalidPeriodError('period_start cannot be after period_end');
  }

  return { periodStart: period_start, periodEnd: period_end };
}

module.exports = { validateGenerateRequest };
