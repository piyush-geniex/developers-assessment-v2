/**
 * Explicit validator functions per AGENTS.md guidelines.
 * Each field has its own validator function for auditability.
 */

export function validateDateString(value: any): Date {
  if (value === null || value === undefined) {
    throw new Error('Date is required');
  }

  if (typeof value !== 'string') {
    throw new Error('Date must be a string');
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return date;
}

export function validateRemittanceStatus(value: any): string {
  if (value === null || value === undefined) {
    throw new Error('Remittance status is required');
  }

  if (typeof value !== 'string') {
    throw new Error('Remittance status must be a string');
  }

  const valid = ['REMITTED', 'UNREMITTED'];
  if (!valid.includes(value)) {
    throw new Error(`Invalid remittance status: ${value}. Must be one of: ${valid.join(', ')}`);
  }

  return value;
}

export function validateUserId(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new Error('User ID must be a string');
  }

  return value.trim();
}

export function validatePeriodDates(
  period_start: any,
  period_end: any,
): { period_start: Date; period_end: Date } {
  const start = validateDateString(period_start);
  const end = validateDateString(period_end);

  if (start > end) {
    throw new Error('period_start cannot be after period_end');
  }

  return { period_start: start, period_end: end };
}

export function validatePositiveDecimal(value: any, fieldName: string): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`${fieldName} must be numeric`);
  }

  return num;
}
