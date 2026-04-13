export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoneyString(value: string): number {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) {
    return 0;
  }
  return roundMoney(n);
}
