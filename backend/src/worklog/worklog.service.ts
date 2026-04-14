import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Worklog } from './models/worklog.entity';
import { WorkLogSegment } from './models/work-log-segment.entity';
import { Adjustment } from './models/adjustment.entity';
import { computeAmounts, segmentLineAmount } from './worklog.math';
import { SettlementService } from '../settlement/settlement.service';
import { round4 } from '../common/money';

export interface WorklogListQuery {
  remittanceStatus?: 'REMITTED' | 'UNREMITTED';
  userId?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface WorklogListItem {
  worklog_id: number;
  user_id: number;
  task_id: string;
  status: string;
  base_amount: number;
  adjustments: number;
  final_amount: number;
  remittance_status: 'REMITTED' | 'UNREMITTED';
  breakdown: {
    segments: {
      id: number;
      duration_minutes: number;
      rate: number | null;
      amount: number | null;
      line_amount: number;
      earned_at: string;
      created_at: string;
    }[];
    adjustments: {
      id: number;
      type: string;
      amount_delta: number;
      reason: string;
      created_at: string;
      applies_to_segment_id: number | null;
    }[];
  };
}

@Injectable()
export class WorklogService {
  constructor(
    @InjectRepository(Worklog)
    private readonly worklogRepo: Repository<Worklog>,
    @InjectRepository(WorkLogSegment)
    private readonly segmentRepo: Repository<WorkLogSegment>,
    @InjectRepository(Adjustment)
    private readonly adjustmentRepo: Repository<Adjustment>,
    private readonly settlementService: SettlementService,
  ) {}

  async listWorklogs(query: WorklogListQuery): Promise<WorklogListItem[]> {
    const qb = this.worklogRepo.createQueryBuilder('w');

    if (query.userId != null) {
      qb.andWhere('w.user_id = :uid', { uid: query.userId });
    }

    if (query.periodStart != null && query.periodEnd != null) {
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1 FROM work_log_segment s
            WHERE s.worklog_id = w.id
              AND s.earned_at BETWEEN :ps::date AND :pe::date
          )
          OR EXISTS (
            SELECT 1 FROM adjustment a
            WHERE a.worklog_id = w.id
              AND (a.created_at AT TIME ZONE 'UTC')::date BETWEEN :ps::date AND :pe::date
          )
        )`,
        { ps: query.periodStart, pe: query.periodEnd },
      );
    }

    qb.orderBy('w.id', 'ASC');
    const worklogs = await qb.getMany();
    if (worklogs.length === 0) {
      return [];
    }

    const ids = worklogs.map((w) => w.id);
    const segments = await this.segmentRepo.find({
      where: { worklogId: In(ids) },
      order: { id: 'ASC' },
    });
    const adjustments = await this.adjustmentRepo.find({
      where: { worklogId: In(ids) },
      order: { id: 'ASC' },
    });

    const segsByWl = new Map<number, WorkLogSegment[]>();
    const adjsByWl = new Map<number, Adjustment[]>();
    for (const s of segments) {
      const list = segsByWl.get(s.worklogId) ?? [];
      list.push(s);
      segsByWl.set(s.worklogId, list);
    }
    for (const a of adjustments) {
      const list = adjsByWl.get(a.worklogId) ?? [];
      list.push(a);
      adjsByWl.set(a.worklogId, list);
    }

    const remittedMap =
      await this.settlementService.sumRemittedSuccessForWorklogIds(ids);

    const out: WorklogListItem[] = [];

    for (const wl of worklogs) {
      const segs = segsByWl.get(wl.id) ?? [];
      const adjs = adjsByWl.get(wl.id) ?? [];
      const { baseAmount, adjustments: adjSum, finalAmount } = computeAmounts(
        wl,
        segs,
        adjs,
      );
      const remitted = remittedMap.get(wl.id) ?? 0;
      const remittanceStatus = SettlementService.computeRemittedStatus(
        finalAmount,
        remitted,
      );

      if (query.remittanceStatus != null && query.remittanceStatus !== remittanceStatus) {
        continue;
      }

      out.push({
        worklog_id: wl.id,
        user_id: wl.userId,
        task_id: wl.taskId,
        status: wl.status,
        base_amount: baseAmount,
        adjustments: adjSum,
        final_amount: finalAmount,
        remittance_status: remittanceStatus,
        breakdown: {
          segments: segs.map((s) => ({
            id: s.id,
            duration_minutes: s.durationMinutes,
            rate: s.rate != null ? round4(parseFloat(s.rate)) : null,
            amount: s.amount != null ? round4(parseFloat(s.amount)) : null,
            line_amount: segmentLineAmount(s),
            earned_at: s.earnedAt,
            created_at: s.createdAt.toISOString(),
          })),
          adjustments: adjs.map((a) => ({
            id: a.id,
            type: a.type,
            amount_delta: round4(parseFloat(a.amountDelta)),
            reason: a.reason,
            created_at: a.createdAt.toISOString(),
            applies_to_segment_id: a.appliesToSegmentId,
          })),
        },
      });
    }

    return out;
  }
}
