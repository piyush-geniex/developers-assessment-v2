import { Adjustment } from './models/adjustment.entity';
import { WorklogStatus } from './models/worklog-status.enum';
import { Worklog } from './models/worklog.entity';
import { WorkLogSegment } from './models/work-log-segment.entity';
import { isEffectivelyZero, n, round4 } from '../common/money';

export class WorklogMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorklogMathError';
  }
}

export function segmentLineAmount(segment: WorkLogSegment): number {
  if (segment.durationMinutes <= 0) {
    throw new WorklogMathError('duration_minutes must be positive');
  }
  const hasRate = segment.rate != null && segment.rate !== '';
  const hasAmount = segment.amount != null && segment.amount !== '';
  if (hasRate === hasAmount) {
    throw new WorklogMathError('segment must have exactly one of rate or amount');
  }
  if (hasAmount) {
    return round4(n(segment.amount));
  }
  return round4((segment.durationMinutes / 60) * n(segment.rate));
}

export function baseAmountFromSegments(segments: WorkLogSegment[]): number {
  let total = 0;
  for (const s of segments) {
    total += segmentLineAmount(s);
  }
  return round4(total);
}

export function adjustmentTotal(adjustments: Adjustment[]): number {
  let total = 0;
  for (const a of adjustments) {
    total += n(a.amountDelta);
  }
  return round4(total);
}

export function computeAmounts(worklog: Worklog, segments: WorkLogSegment[], adjustments: Adjustment[]) {
  if (worklog.status === WorklogStatus.CLOSED) {
    return {
      baseAmount: 0,
      adjustments: 0,
      finalAmount: 0,
    };
  }
  const base = baseAmountFromSegments(segments);
  const adj = adjustmentTotal(adjustments);
  const finalAmount = round4(base + adj);
  return {
    baseAmount: base,
    adjustments: adj,
    finalAmount,
  };
}

export function isFullyRemitted(finalAmount: number, remittedTotal: number): boolean {
  return isEffectivelyZero(round4(finalAmount - remittedTotal));
}
