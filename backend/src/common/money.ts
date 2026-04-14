/** Numeric amounts stored as decimal strings from PostgreSQL; compute in JS with fixed precision. */
const SCALE = 4;

export function n(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const x = parseFloat(value);
  return Number.isFinite(x) ? x : 0;
}

export function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

export function toDecimalString(value: number): string {
  return round4(value).toFixed(SCALE);
}

export function isEffectivelyZero(value: number, epsilon = 1e-4): boolean {
  return Math.abs(value) < epsilon;
}
