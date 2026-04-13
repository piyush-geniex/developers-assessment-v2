import { roundMoney } from '../common/money.util';
import type { AdjustmentRecord, SegmentRecord } from './worklog.types';
import { validateHourlyRate } from '../common/domain.validation';

export function utcYmdFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function segmentHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, ms / 3_600_000);
}

export function segmentEarnings(
  hourlyRateRaw: string,
  segment: SegmentRecord,
): number {
  if (segment.status !== 'approved') {
    return 0;
  }
  const rate = validateHourlyRate(Number.parseFloat(hourlyRateRaw));
  const hours = segmentHours(segment.start, segment.end);
  return roundMoney(hours * rate);
}

export function adjustmentAmount(adj: AdjustmentRecord): number {
  return roundMoney(Number(adj.amount));
}

export function totalCalculatedAmount(
  hourlyRateRaw: string,
  segments: SegmentRecord[],
  adjustments: AdjustmentRecord[],
): number {
  let total = 0;
  for (const seg of segments) {
    total += segmentEarnings(hourlyRateRaw, seg);
  }
  for (const adj of adjustments) {
    total += adjustmentAmount(adj);
  }
  return roundMoney(total);
}

export function worklogTouchesPeriod(
  segments: SegmentRecord[],
  adjustments: AdjustmentRecord[],
  periodStartYmd: string,
  periodEndYmd: string,
): boolean {
  for (const seg of segments) {
    const ymd = utcYmdFromIso(seg.end);
    if (ymd >= periodStartYmd && ymd <= periodEndYmd) {
      return true;
    }
  }
  for (const adj of adjustments) {
    const ymd = utcYmdFromIso(adj.applied_at);
    if (ymd >= periodStartYmd && ymd <= periodEndYmd) {
      return true;
    }
  }
  return false;
}
