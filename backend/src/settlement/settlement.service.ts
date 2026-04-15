import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Remittance } from './entities/remittance.entity';
import { WorklogsService } from '../worklogs/worklogs.service';
import { Worklog } from '../worklogs/entities/worklog.entity';
import { Adjustment } from '../worklogs/entities/adjustment.entity';
import { GenerateRemittancesDto, UserSettlementResult } from './dto/generate-remittances.dto';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectRepository(Remittance)
    private readonly remittanceRepo: Repository<Remittance>,
    private readonly worklogsService: WorklogsService,
    private readonly dataSource: DataSource,
  ) {}

  async generateRemittances(dto: GenerateRemittancesDto) {
    const { period_start, period_end } = dto;
    const users = await this.worklogsService.findAllUsers();

    const results: UserSettlementResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const result = await this.settleUser(user.user_id, user.user_name, period_start, period_end);
        results.push(result);
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Settlement failed for user ${user.user_id}: ${message}`);
        results.push({
          user_id: user.user_id,
          user_name: user.user_name,
          amount: 0,
          worklog_count: 0,
          status: 'FAILED',
          error: message,
        });
        failed++;
      }
    }

    return { period_start, period_end, succeeded, failed, remittances: results };
  }

  private async settleUser(
    userId: string,
    userName: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<UserSettlementResult> {
    // Idempotency: reject duplicate settlement for the same user + period
    const existing = await this.remittanceRepo.findOne({
      where: { user_id: userId, period_start: periodStart, period_end: periodEnd },
    });
    if (existing) {
      throw new ConflictException(
        `Remittance already exists for user ${userId} in period ${periodStart} – ${periodEnd}`,
      );
    }

    const allWorklogs = await this.worklogsService.findByUserId(userId);

    // Worklogs with at least one approved segment that starts within the period
    const periodEnd24h = new Date(new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000);
    const eligibleWorklogs = allWorklogs.filter((wl) =>
      (wl.segments ?? []).some(
        (s) =>
          s.status === 'approved' &&
          s.started_at >= new Date(periodStart) &&
          s.started_at < periodEnd24h,
      ),
    );

    // Base amount: sum of (approved hours × rate) for in-period segments only
    let baseAmount = 0;
    for (const wl of eligibleWorklogs) {
      const inPeriodApproved = (wl.segments ?? []).filter(
        (s) =>
          s.status === 'approved' &&
          s.started_at >= new Date(periodStart) &&
          s.started_at < periodEnd24h,
      );
      for (const seg of inPeriodApproved) {
        const hours = (seg.ended_at.getTime() - seg.started_at.getTime()) / 3_600_000;
        baseAmount += hours * Number(wl.hourly_rate);
      }
    }

    // Carry-forward: unsettled adjustments across ALL user worklogs, not just eligible ones.
    // This is what handles retroactive adjustments on previously-settled work (constraint 4).
    const allWorklogIds = allWorklogs.map((w) => w.id);
    const pendingAdjustments = await this.worklogsService.findUnsettledAdjustments(allWorklogIds);
    const adjustmentTotal = pendingAdjustments.reduce((sum, a) => sum + Number(a.amount), 0);

    const amount = Math.round((baseAmount + adjustmentTotal) * 100) / 100;

    // Run the whole settlement atomically: create remittance, update worklogs,
    // stamp adjustments — all in one transaction so there are no half-committed states.
    const remittance = await this.dataSource.transaction(async (em) => {
      const saved = await em.save(
        em.create(Remittance, {
          user_id: userId,
          user_name: userName,
          period_start: periodStart,
          period_end: periodEnd,
          amount,
          status: 'SETTLED',
        }),
      );

      if (eligibleWorklogs.length > 0) {
        await em
          .createQueryBuilder()
          .update(Worklog)
          .set({ remittance_status: 'REMITTED' })
          .whereInIds(eligibleWorklogs.map((w) => w.id))
          .execute();
      }

      if (pendingAdjustments.length > 0) {
        await em
          .createQueryBuilder()
          .update(Adjustment)
          .set({ settled_in_remittance_id: saved.id })
          .whereInIds(pendingAdjustments.map((a) => a.id))
          .execute();
      }

      return saved;
    });

    this.logger.log(
      `Settled user=${userId} remittance=${remittance.id} amount=${amount} worklogs=${eligibleWorklogs.length} adjustments=${pendingAdjustments.length}`,
    );

    return {
      user_id: userId,
      user_name: userName,
      amount,
      worklog_count: eligibleWorklogs.length,
      status: 'SETTLED',
    };
  }
}
