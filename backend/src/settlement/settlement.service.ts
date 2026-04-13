import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { validateSettlementAmount } from '../common/domain.validation';
import { roundMoney } from '../common/money.util';
import {
  adjustmentAmount,
  segmentEarnings,
  utcYmdFromIso,
} from '../worklog/worklog.calculator';
import { WorklogEntity } from '../worklog/worklog.entity';
import type { AdjustmentRecord, SegmentRecord } from '../worklog/worklog.types';
import { RemittanceLineEntity } from './remittance-line.entity';
import { RemittanceEntity } from './remittance.entity';

const COMPONENT_SEGMENT = 'segment';
const COMPONENT_ADJUSTMENT = 'adjustment';
const STATUS_COMPLETED = 'completed';
const STATUS_FAILED = 'failed';

type PendingLine = {
  worklogId: number;
  componentKind: string;
  referenceId: string;
  amount: number;
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectRepository(WorklogEntity)
    private readonly worklogRepo: Repository<WorklogEntity>,
    @InjectRepository(RemittanceLineEntity)
    private readonly lineRepo: Repository<RemittanceLineEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async generateRemittances(
    periodStart: string,
    periodEnd: string,
  ): Promise<{
    period_start: string;
    period_end: string;
    remittances: Array<{
      id: number;
      user_id: string;
      amount: number;
      status: string;
    }>;
    summary: {
      succeeded: number;
      failed: number;
      users_with_no_amount: number;
      errors: Array<{ user_id: string; error: string }>;
    };
  }> {
    if (periodEnd < periodStart) {
      throw new BadRequestException('period_end must be on or after period_start');
    }

    const settledKeys = await this.loadSettledComponentKeys();

    const worklogs = await this.worklogRepo.find();
    const byUser = new Map<string, WorklogEntity[]>();
    for (const wl of worklogs) {
      const list = byUser.get(wl.userId) ?? [];
      list.push(wl);
      byUser.set(wl.userId, list);
    }

    const remittances: Array<{
      id: number;
      user_id: string;
      amount: number;
      status: string;
    }> = [];
    const errors: Array<{ user_id: string; error: string }> = [];
    let succeeded = 0;
    let failed = 0;
    let usersWithNoAmount = 0;

    for (const [userId, userWorklogs] of byUser.entries()) {
      try {
        const pending = this.collectPendingLinesForUser(
          userWorklogs,
          periodStart,
          periodEnd,
          settledKeys,
        );
        const total = roundMoney(
          pending.reduce((acc, line) => acc + line.amount, 0),
        );

        if (pending.length === 0) {
          usersWithNoAmount += 1;
          continue;
        }

        const payoutOk = await this.simulatePayout(userId);
        if (!payoutOk) {
          await this.persistFailedRemittance(userId, periodStart, periodEnd, total);
          failed += 1;
          continue;
        }

        const created = await this.persistCompletedRemittance(
          userId,
          periodStart,
          periodEnd,
          total,
          pending,
        );
        remittances.push({
          id: created.id,
          user_id: userId,
          amount: validateSettlementAmount(Number.parseFloat(created.amount)),
          status: created.status,
        });
        for (const line of pending) {
          settledKeys.add(
            componentKey(line.worklogId, line.componentKind, line.referenceId),
          );
        }
        succeeded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (this.isUniqueViolation(err)) {
          this.logger.warn(
            `Duplicate component settlement for user ${userId}: ${message}`,
          );
          failed += 1;
          errors.push({
            user_id: userId,
            error: 'Duplicate settlement for one or more components.',
          });
          continue;
        }
        this.logger.error(`Settlement failed for user ${userId}: ${message}`);
        failed += 1;
        errors.push({ user_id: userId, error: message });
      }
    }

    return {
      period_start: periodStart,
      period_end: periodEnd,
      remittances,
      summary: {
        succeeded,
        failed,
        users_with_no_amount: usersWithNoAmount,
        errors,
      },
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      typeof err.driverError === 'object' &&
      err.driverError !== null &&
      'code' in err.driverError &&
      (err.driverError as { code?: string }).code === '23505'
    );
  }

  private async loadSettledComponentKeys(): Promise<Set<string>> {
    const rows = await this.lineRepo
      .createQueryBuilder('line')
      .innerJoin('line.remittance', 'r')
      .where('r.status = :status', { status: STATUS_COMPLETED })
      .select([
        'line.worklogId',
        'line.componentKind',
        'line.referenceId',
      ])
      .getMany();

    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(
        componentKey(row.worklogId, row.componentKind, row.referenceId),
      );
    }
    return keys;
  }

  private collectPendingLinesForUser(
    worklogs: WorklogEntity[],
    periodStart: string,
    periodEnd: string,
    settledKeys: Set<string>,
  ): PendingLine[] {
    const pending: PendingLine[] = [];

    for (const wl of worklogs) {
      for (const seg of wl.segments ?? []) {
        if (seg.status !== 'approved') {
          continue;
        }
        const ymd = utcYmdFromIso(seg.end);
        if (ymd < periodStart || ymd > periodEnd) {
          continue;
        }
        const key = componentKey(wl.id, COMPONENT_SEGMENT, seg.segment_id);
        if (settledKeys.has(key)) {
          continue;
        }
        const amount = segmentEarnings(wl.hourlyRate, seg as SegmentRecord);
        pending.push({
          worklogId: wl.id,
          componentKind: COMPONENT_SEGMENT,
          referenceId: seg.segment_id,
          amount: validateSettlementAmount(amount),
        });
      }

      for (const adj of wl.adjustments ?? []) {
        const ymd = utcYmdFromIso(adj.applied_at);
        if (ymd < periodStart || ymd > periodEnd) {
          continue;
        }
        const key = componentKey(
          wl.id,
          COMPONENT_ADJUSTMENT,
          adj.adjustment_id,
        );
        if (settledKeys.has(key)) {
          continue;
        }
        const amount = adjustmentAmount(adj as AdjustmentRecord);
        pending.push({
          worklogId: wl.id,
          componentKind: COMPONENT_ADJUSTMENT,
          referenceId: adj.adjustment_id,
          amount: validateSettlementAmount(amount),
        });
      }
    }

    return pending;
  }

  private async simulatePayout(userId: string): Promise<boolean> {
    const failUser = process.env.PAYOUT_FAIL_USER_ID;
    if (failUser && failUser === userId) {
      return false;
    }
    return true;
  }

  private async persistFailedRemittance(
    userId: string,
    periodStart: string,
    periodEnd: string,
    attemptedAmount: number,
  ): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const remittance = qr.manager.create(RemittanceEntity, {
        userId,
        periodStart,
        periodEnd,
        amount: '0.00',
        status: STATUS_FAILED,
      });
      await qr.manager.save(remittance);
      await qr.commitTransaction();
      this.logger.warn(
        `Payout failed for user ${userId}; attempted net ${attemptedAmount} not allocated (no remittance lines).`,
      );
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  private async persistCompletedRemittance(
    userId: string,
    periodStart: string,
    periodEnd: string,
    total: number,
    pending: PendingLine[],
  ): Promise<RemittanceEntity> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const remittance = qr.manager.create(RemittanceEntity, {
        userId,
        periodStart,
        periodEnd,
        amount: validateSettlementAmount(total).toFixed(2),
        status: STATUS_COMPLETED,
      });
      await qr.manager.save(remittance);

      for (const line of pending) {
        const entity = qr.manager.create(RemittanceLineEntity, {
          remittanceId: remittance.id,
          worklogId: line.worklogId,
          componentKind: line.componentKind,
          referenceId: line.referenceId,
          amount: validateSettlementAmount(line.amount).toFixed(2),
        });
        await qr.manager.save(entity);
      }

      await qr.commitTransaction();
      return remittance;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}

function componentKey(
  worklogId: number,
  kind: string,
  referenceId: string,
): string {
  return `${worklogId}:${kind}:${referenceId}`;
}
