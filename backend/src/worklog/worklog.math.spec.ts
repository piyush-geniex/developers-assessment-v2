import { WorklogStatus } from './models/worklog-status.enum';
import { AdjustmentType } from './models/adjustment-type.enum';
import {
  computeAmounts,
  isFullyRemitted,
  segmentLineAmount,
  WorklogMathError,
} from './worklog.math';
import { Worklog } from './models/worklog.entity';
import { WorkLogSegment } from './models/work-log-segment.entity';
import { Adjustment } from './models/adjustment.entity';

function seg(partial: Partial<WorkLogSegment> & Pick<WorkLogSegment, 'durationMinutes'>): WorkLogSegment {
  return {
    id: 1,
    worklogId: 1,
    durationMinutes: partial.durationMinutes,
    rate: partial.rate ?? null,
    amount: partial.amount ?? null,
    earnedAt: partial.earnedAt ?? '2025-11-01',
    createdAt: partial.createdAt ?? new Date(),
  } as WorkLogSegment;
}

function wl(status: WorklogStatus = WorklogStatus.ACTIVE): Worklog {
  return {
    id: 1,
    userId: 1,
    taskId: 't1',
    status,
  } as Worklog;
}

describe('worklog.math', () => {
  it('segmentLineAmount uses amount when set', () => {
    expect(segmentLineAmount(seg({ durationMinutes: 60, amount: '100.0000' }))).toBe(100);
  });

  it('segmentLineAmount uses rate * hours', () => {
    expect(segmentLineAmount(seg({ durationMinutes: 90, rate: '40.0000' }))).toBe(60);
  });

  it('rejects invalid segment', () => {
    expect(() => segmentLineAmount(seg({ durationMinutes: 30, rate: '1', amount: '1' }))).toThrow(
      WorklogMathError,
    );
  });

  it('computeAmounts sums segments and adjustments', () => {
    const segments = [
      seg({ durationMinutes: 60, rate: '75', earnedAt: '2025-11-01' }),
      seg({ durationMinutes: 120, rate: '75', earnedAt: '2025-11-02' }),
    ];
    const adjustments = [
      { amountDelta: '-25.0000', type: AdjustmentType.DEDUCT } as Adjustment,
    ];
    const r = computeAmounts(wl(), segments, adjustments);
    expect(r.baseAmount).toBe(225);
    expect(r.adjustments).toBe(-25);
    expect(r.finalAmount).toBe(200);
  });

  it('CLOSED worklog yields zero final amount', () => {
    const r = computeAmounts(
      wl(WorklogStatus.CLOSED),
      [seg({ durationMinutes: 60, rate: '100' })],
      [],
    );
    expect(r.finalAmount).toBe(0);
  });

  it('isFullyRemitted', () => {
    expect(isFullyRemitted(100, 100)).toBe(true);
    expect(isFullyRemitted(100, 50)).toBe(false);
  });
});
