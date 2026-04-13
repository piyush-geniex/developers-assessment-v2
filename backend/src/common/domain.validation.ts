import { roundMoney } from './money.util';

export function validateSettlementAmount(value: unknown): number {
  if (value === null || value === undefined) {
    throw new Error('amount is required');
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n) || typeof n !== 'number') {
    throw new Error('amount must be numeric');
  }
  return roundMoney(n);
}

export function validateHourlyRate(value: unknown): number {
  if (value === null || value === undefined) {
    throw new Error('hourly_rate is required');
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new Error('hourly_rate must be a non-negative number');
  }
  return roundMoney(n);
}
