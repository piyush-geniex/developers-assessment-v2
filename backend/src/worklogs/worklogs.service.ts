import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { Worklog } from './entities/worklog.entity';
import { Adjustment } from './entities/adjustment.entity';
import { QueryWorklogsDto } from './dto/query-worklogs.dto';

@Injectable()
export class WorklogsService {
  constructor(
    @InjectRepository(Worklog)
    private readonly worklogRepo: Repository<Worklog>,
    @InjectRepository(Adjustment)
    private readonly adjustmentRepo: Repository<Adjustment>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: QueryWorklogsDto) {
    const qb = this.worklogRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.segments', 'seg')
      .leftJoinAndSelect('w.adjustments', 'adj')
      .orderBy('w.created_at', 'DESC');

    if (query.remittance_status) {
      qb.andWhere('w.remittance_status = :status', {
        status: query.remittance_status,
      });
    }

    if (query.user_id) {
      qb.andWhere('w.user_id = :userId', { userId: query.user_id });
    }

    if (query.period_start) {
      qb.andWhere('seg.started_at >= :start', { start: query.period_start });
    }

    if (query.period_end) {
      // Include segments starting on or before the last day of the period
      qb.andWhere('seg.started_at < :end', {
        end: new Date(
          new Date(query.period_end).getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
    }

    const worklogs = await qb.getMany();
    return worklogs.map((w) => this.toResponseShape(w));
  }

  private toResponseShape(worklog: Worklog) {
    const segments = worklog.segments ?? [];
    const adjustments = worklog.adjustments ?? [];

    const approvedHours = segments
      .filter((s) => s.status === 'approved')
      .reduce((sum, s) => {
        const hours =
          (s.ended_at.getTime() - s.started_at.getTime()) / 3_600_000;
        return sum + hours;
      }, 0);

    const adjustmentTotal = adjustments.reduce(
      (sum, a) => sum + Number(a.amount),
      0,
    );

    const amount = Math.round((approvedHours * Number(worklog.hourly_rate) + adjustmentTotal) * 100) / 100;

    return {
      id: worklog.id,
      external_id: worklog.external_id,
      user_id: worklog.user_id,
      user_name: worklog.user_name,
      task_name: worklog.task_name,
      hourly_rate: Number(worklog.hourly_rate),
      remittance_status: worklog.remittance_status,
      amount,
      segments: segments.map((s) => ({
        id: s.id,
        external_id: s.external_id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        hours: Math.round(((s.ended_at.getTime() - s.started_at.getTime()) / 3_600_000) * 100) / 100,
        status: s.status,
        ...(s.dispute_reason ? { dispute_reason: s.dispute_reason } : {}),
      })),
      adjustments: adjustments.map((a) => ({
        id: a.id,
        external_id: a.external_id,
        amount: Number(a.amount),
        reason: a.reason,
        applied_at: a.applied_at,
      })),
      created_at: worklog.created_at,
    };
  }

  /**
   * Returns all worklogs for a user including their segments and unsettled adjustments.
   * Used by the settlement service.
   */
  async findByUserId(userId: string): Promise<Worklog[]> {
    return this.worklogRepo.find({
      where: { user_id: userId },
      relations: ['segments', 'adjustments'],
    });
  }

  /**
   * Returns all distinct user IDs in the system.
   */
  async findAllUserIds(): Promise<string[]> {
    const rows = await this.worklogRepo
      .createQueryBuilder('w')
      .select('DISTINCT w.user_id', 'user_id')
      .addSelect('w.user_name', 'user_name')
      .getRawMany<{ user_id: string; user_name: string }>();
    return rows.map((r) => r.user_id);
  }

  /**
   * Returns all distinct users (id + name) in the system.
   */
  async findAllUsers(): Promise<{ user_id: string; user_name: string }[]> {
    return this.worklogRepo
      .createQueryBuilder('w')
      .select('DISTINCT w.user_id', 'user_id')
      .addSelect('w.user_name', 'user_name')
      .getRawMany<{ user_id: string; user_name: string }>();
  }

  /**
   * Marks the given worklogs as REMITTED.
   */
  async markRemitted(worklogIds: number[]): Promise<void> {
    if (worklogIds.length === 0) return;
    await this.worklogRepo
      .createQueryBuilder()
      .update(Worklog)
      .set({ remittance_status: 'REMITTED' })
      .whereInIds(worklogIds)
      .execute();
  }

  /**
   * Finds all adjustments not yet linked to a remittance for the given worklogs.
   * This covers retroactive adjustments on previously-settled worklogs.
   */
  async findUnsettledAdjustments(worklogIds: number[]): Promise<Adjustment[]> {
    if (worklogIds.length === 0) return [];
    return this.adjustmentRepo.find({
      where: worklogIds.map((id) => ({
        worklog_id: id,
        settled_in_remittance_id: IsNull(),
      })),
    });
  }

  /**
   * Stamps adjustments with the remittance ID so they won't be double-counted.
   */
  async markAdjustmentsSettled(
    adjustmentIds: number[],
    remittanceId: number,
  ): Promise<void> {
    if (adjustmentIds.length === 0) return;
    await this.adjustmentRepo
      .createQueryBuilder()
      .update(Adjustment)
      .set({ settled_in_remittance_id: remittanceId })
      .whereInIds(adjustmentIds)
      .execute();
  }
}
