import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { roundMoney } from '../common/money.util';
import { RemittanceLineEntity } from '../settlement/remittance-line.entity';
import type { ListWorklogsQueryDto } from './dto/list-worklogs-query.dto';
import {
  totalCalculatedAmount,
  worklogTouchesPeriod,
} from './worklog.calculator';
import { WorklogEntity } from './worklog.entity';
import type { AdjustmentRecord, SegmentRecord } from './worklog.types';

const COMPONENT_SEGMENT = 'segment';
const COMPONENT_ADJUSTMENT = 'adjustment';
const STATUS_COMPLETED = 'completed';

@Injectable()
export class WorklogService {
  constructor(
    @InjectRepository(WorklogEntity)
    private readonly worklogRepo: Repository<WorklogEntity>,
    @InjectRepository(RemittanceLineEntity)
    private readonly lineRepo: Repository<RemittanceLineEntity>,
  ) {}

  async list(query: ListWorklogsQueryDto): Promise<{
    worklogs: Array<Record<string, unknown>>;
  }> {
    const periodStart = query.period_start;
    const periodEnd = query.period_end;
    if (
      (periodStart && !periodEnd) ||
      (!periodStart && periodEnd)
    ) {
      throw new BadRequestException(
        'period_start and period_end must be supplied together',
      );
    }

    const qb = this.worklogRepo.createQueryBuilder('w');
    if (query.user_id) {
      qb.andWhere('w.user_id = :userId', { userId: query.user_id });
    }
    let worklogs = await qb.getMany();

    if (periodStart && periodEnd) {
      if (periodEnd < periodStart) {
        throw new BadRequestException(
          'period_end must be on or after period_start',
        );
      }
      worklogs = worklogs.filter((wl) =>
        worklogTouchesPeriod(
          wl.segments ?? [],
          wl.adjustments ?? [],
          periodStart,
          periodEnd,
        ),
      );
    }

    const settledKeys = await this.loadSettledComponentKeys();

    const rows: Array<Record<string, unknown>> = [];
    for (const wl of worklogs) {
      const calculatedAmount = totalCalculatedAmount(
        wl.hourlyRate,
        (wl.segments ?? []) as SegmentRecord[],
        (wl.adjustments ?? []) as AdjustmentRecord[],
      );
      const status = this.computeRemittanceStatus(wl, settledKeys);

      if (query.remittance_status && query.remittance_status !== status) {
        continue;
      }

      rows.push({
        id: wl.id,
        worklog_id: wl.externalId,
        user_id: wl.userId,
        user_name: wl.userName,
        task_name: wl.taskName,
        hourly_rate: roundMoney(Number.parseFloat(wl.hourlyRate)),
        calculated_amount: calculatedAmount,
        remittance_status: status,
      });
    }

    return { worklogs: rows };
  }

  private async loadSettledComponentKeys(): Promise<Set<string>> {
    const lines = await this.lineRepo
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
    for (const line of lines) {
      keys.add(
        `${line.worklogId}:${line.componentKind}:${line.referenceId}`,
      );
    }
    return keys;
  }

  private computeRemittanceStatus(
    wl: WorklogEntity,
    settledKeys: Set<string>,
  ): 'REMITTED' | 'UNREMITTED' {
    const refs: Array<{ kind: string; ref: string }> = [];
    for (const seg of wl.segments ?? []) {
      if (seg.status === 'approved') {
        refs.push({ kind: COMPONENT_SEGMENT, ref: seg.segment_id });
      }
    }
    for (const adj of wl.adjustments ?? []) {
      refs.push({ kind: COMPONENT_ADJUSTMENT, ref: adj.adjustment_id });
    }

    if (refs.length === 0) {
      return 'REMITTED';
    }

    for (const r of refs) {
      const key = `${wl.id}:${r.kind}:${r.ref}`;
      if (!settledKeys.has(key)) {
        return 'UNREMITTED';
      }
    }
    return 'REMITTED';
  }
}
