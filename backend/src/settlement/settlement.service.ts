import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../user/models/user.entity';
import { Worklog } from '../worklog/models/worklog.entity';
import { WorkLogSegment } from '../worklog/models/work-log-segment.entity';
import { Adjustment } from '../worklog/models/adjustment.entity';
import { Remittance } from './models/remittance.entity';
import { RemittanceItem } from './models/remittance-item.entity';
import { RemittanceStatus } from './models/remittance-status.enum';
import { computeAmounts, isFullyRemitted } from '../worklog/worklog.math';
import { isEffectivelyZero, n, round4, toDecimalString } from '../common/money';

export interface GenerateRemittanceRow {
  user_id: number;
  remittance_id: number;
  total_amount: number;
}

export interface GenerateRemittanceError {
  user_id: number;
  error: string;
}

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Worklog)
    private readonly worklogRepo: Repository<Worklog>,
    @InjectRepository(WorkLogSegment)
    private readonly segmentRepo: Repository<WorkLogSegment>,
    @InjectRepository(Adjustment)
    private readonly adjustmentRepo: Repository<Adjustment>,
    @InjectRepository(Remittance)
    private readonly remittanceRepo: Repository<Remittance>,
    @InjectRepository(RemittanceItem)
    private readonly remittanceItemRepo: Repository<RemittanceItem>,
  ) {}

  async findEligibleWorklogIds(
    userId: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<number[]> {
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT w.id
      FROM worklog w
      WHERE w.user_id = $1
        AND (
          EXISTS (
            SELECT 1 FROM work_log_segment s
            WHERE s.worklog_id = w.id
              AND s.earned_at BETWEEN $2::date AND $3::date
          )
          OR EXISTS (
            SELECT 1 FROM adjustment a
            WHERE a.worklog_id = w.id
              AND (a.created_at AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
          )
        )
    `,
      [userId, periodStart, periodEnd],
    );
    return rows.map((r: { id: number }) => r.id);
  }

  async sumRemittedSuccessForWorklog(worklogId: number): Promise<number> {
    const m = await this.sumRemittedSuccessForWorklogIds([worklogId]);
    return m.get(worklogId) ?? 0;
  }

  async generateRemittances(periodStart: string, periodEnd: string): Promise<{
    generated: GenerateRemittanceRow[];
    errors: GenerateRemittanceError[];
  }> {
    const users = await this.userRepo.find({ order: { id: 'ASC' } });
    const generated: GenerateRemittanceRow[] = [];
    const errors: GenerateRemittanceError[] = [];

    for (const user of users) {
      try {
        const row = await this.processUserRemittance(user.id, periodStart, periodEnd);
        if (row) {
          generated.push(row);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.error(`Remittance failed for user ${user.id}: ${message}`);
        errors.push({ user_id: user.id, error: message });
      }
    }

    return { generated, errors };
  }

  private async processUserRemittance(
    userId: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<GenerateRemittanceRow | null> {
    const existing = await this.remittanceRepo.findOne({
      where: { userId, periodStart, periodEnd },
    });
    if (existing?.status === RemittanceStatus.SUCCESS) {
      return {
        user_id: userId,
        remittance_id: existing.id,
        total_amount: n(existing.totalAmount),
      };
    }

    const eligibleIds = await this.findEligibleWorklogIds(userId, periodStart, periodEnd);
    const itemsPayload = await this.buildItemsForUser(userId, eligibleIds);

    const totalRaw = round4(
      itemsPayload.reduce((s, i) => s + i.deltaPaid, 0),
    );

    if (totalRaw < 0) {
      await this.persistFailedRemittance(
        userId,
        periodStart,
        periodEnd,
        `Negative settlement total (${totalRaw}); resolve adjustments before retrying.`,
      );
      throw new Error(
        `Negative settlement total for user ${userId}: ${totalRaw}`,
      );
    }

    const totalAmount = totalRaw;

    await this.dataSource.transaction(async (em) => {
      let remittance = await em.findOne(Remittance, {
        where: { userId, periodStart, periodEnd },
        lock: { mode: 'pessimistic_write' },
      });

      if (remittance?.status === RemittanceStatus.SUCCESS) {
        return;
      }

      if (remittance) {
        await em.delete(RemittanceItem, { remittanceId: remittance.id });
      }

      if (!remittance) {
        remittance = em.create(Remittance, {
          userId,
          periodStart,
          periodEnd,
          totalAmount: toDecimalString(totalAmount),
          status: RemittanceStatus.SUCCESS,
          errorMessage: null,
        });
        await em.save(remittance);
      } else {
        remittance.totalAmount = toDecimalString(totalAmount);
        remittance.status = RemittanceStatus.SUCCESS;
        remittance.errorMessage = null;
        await em.save(remittance);
      }

      for (const line of itemsPayload) {
        const item = em.create(RemittanceItem, {
          remittanceId: remittance.id,
          worklogId: line.worklogId,
          computedAmount: toDecimalString(line.computedAmount),
          adjustmentAppliedAmount: toDecimalString(line.adjustmentAppliedAmount),
          deltaPaid: toDecimalString(line.deltaPaid),
        });
        await em.save(item);
      }
    });

    const saved = await this.remittanceRepo.findOneOrFail({
      where: { userId, periodStart, periodEnd },
    });

    return {
      user_id: userId,
      remittance_id: saved.id,
      total_amount: n(saved.totalAmount),
    };
  }

  private async persistFailedRemittance(
    userId: number,
    periodStart: string,
    periodEnd: string,
    message: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      let remittance = await em.findOne(Remittance, {
        where: { userId, periodStart, periodEnd },
        lock: { mode: 'pessimistic_write' },
      });
      if (remittance?.status === RemittanceStatus.SUCCESS) {
        return;
      }
      if (remittance) {
        await em.delete(RemittanceItem, { remittanceId: remittance.id });
      } else {
        remittance = em.create(Remittance, {
          userId,
          periodStart,
          periodEnd,
          totalAmount: toDecimalString(0),
          status: RemittanceStatus.FAILED,
          errorMessage: message,
        });
        await em.save(remittance);
        return;
      }
      remittance.status = RemittanceStatus.FAILED;
      remittance.errorMessage = message;
      remittance.totalAmount = toDecimalString(0);
      await em.save(remittance);
    });
  }

  private async buildItemsForUser(
    userId: number,
    eligibleIds: number[],
  ): Promise<
    {
      worklogId: number;
      computedAmount: number;
      adjustmentAppliedAmount: number;
      deltaPaid: number;
    }[]
  > {
    if (eligibleIds.length === 0) {
      return [];
    }

    const worklogs = await this.worklogRepo.find({
      where: { id: In(eligibleIds), userId },
    });
    const segments = await this.segmentRepo.find({
      where: { worklogId: In(eligibleIds) },
      order: { id: 'ASC' },
    });
    const adjustments = await this.adjustmentRepo.find({
      where: { worklogId: In(eligibleIds) },
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

    const items: {
      worklogId: number;
      computedAmount: number;
      adjustmentAppliedAmount: number;
      deltaPaid: number;
    }[] = [];

    const remittedMap = await this.sumRemittedSuccessForWorklogIds(
      worklogs.map((w) => w.id),
    );

    for (const wl of worklogs) {
      const segs = segsByWl.get(wl.id) ?? [];
      const adjs = adjsByWl.get(wl.id) ?? [];
      const { adjustments: adjTotal, finalAmount } = computeAmounts(
        wl,
        segs,
        adjs,
      );
      const remitted = remittedMap.get(wl.id) ?? 0;
      const delta = round4(finalAmount - remitted);
      if (isEffectivelyZero(delta)) {
        continue;
      }
      items.push({
        worklogId: wl.id,
        computedAmount: finalAmount,
        adjustmentAppliedAmount: adjTotal,
        deltaPaid: delta,
      });
    }

    return items;
  }

  /** Used by GET /worklogs for REMITTED / UNREMITTED filter */
  static computeRemittedStatus(
    finalAmount: number,
    remittedTotal: number,
  ): 'REMITTED' | 'UNREMITTED' {
    return isFullyRemitted(finalAmount, remittedTotal) ? 'REMITTED' : 'UNREMITTED';
  }

  async sumRemittedSuccessForWorklogIds(worklogIds: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (worklogIds.length === 0) {
      return map;
    }
    const rows = await this.dataSource.query(
      `
      SELECT ri.worklog_id AS wid, COALESCE(SUM(ri.delta_paid::numeric), 0)::text AS total
      FROM remittance_item ri
      INNER JOIN remittance r ON r.id = ri.remittance_id
      WHERE ri.worklog_id = ANY($1::int[]) AND r.status = $2
      GROUP BY ri.worklog_id
    `,
      [worklogIds, RemittanceStatus.SUCCESS],
    );
    for (const r of rows) {
      map.set(r.wid as number, round4(n(r.total)));
    }
    for (const id of worklogIds) {
      if (!map.has(id)) {
        map.set(id, 0);
      }
    }
    return map;
  }
}
