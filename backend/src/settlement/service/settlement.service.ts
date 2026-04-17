import { Injectable } from '@nestjs/common';
import { AppDataSource } from '../../database/data-source';
import { WorklogModel } from '../../worklogs/models/worklog.model';
import { RemittanceModel } from '../../remittance/models/remittance.model';
import { Segment, Adjustment } from '../../worklogs/schemas/worklog.types';

@Injectable()
export class SettlementService {
  private worklogRepo = AppDataSource.getRepository(WorklogModel);
  private remittanceRepo = AppDataSource.getRepository(RemittanceModel);

  async generateRemittances(period_start: string, period_end: string) {
    const result = {
      succeeded: 0,
      failed: 0,
      errors: [] as any[],
    };

    try {
      const worklogs = await this.worklogRepo.find();

      const startDate = new Date(period_start);
      const endDate = new Date(period_end);

      // group by user
      const userMap = new Map<string, WorklogModel[]>();

      for (const wl of worklogs) {
        const list = userMap.get(wl.user_id) ?? [];
        list.push(wl);
        userMap.set(wl.user_id, list);
      }

      for (const [user_id, userWorklogs] of userMap.entries()) {
        try {
          let totalAmount = 0;

          for (const wl of userWorklogs) {
            totalAmount += this.calculateWorklogAmount(wl, startDate, endDate);
          }

          if (totalAmount <= 0) continue;

          // IDENTITY CHECK (prevents duplicate remittance per period)
          const existing = await this.remittanceRepo.findOne({
            where: { user_id, period_start, period_end },
          });

          if (existing) continue;

          const remittance = this.remittanceRepo.create({
            user_id,
            amount: totalAmount,
            period_start,
            period_end,
            status: 'PENDING',
          });

          await this.remittanceRepo.save(remittance);

          // batch update instead of loop save (IMPORTANT IMPROVEMENT)
          await this.worklogRepo
            .createQueryBuilder()
            .update(WorklogModel)
            .set({ remittance_status: 'REMITTED' })
            .where('user_id = :user_id', { user_id })
            .execute();

          result.succeeded++;
        } catch (error) {
          console.error(`Settlement failed for user ${user_id}`, error);

          result.failed++;
          result.errors.push({
            user_id,
            error: (error as Error).message,
          });
        }
      }

      return result;
    } catch (error) {
      console.error('Settlement run failed:', error);
      throw new Error('Settlement failed');
    }
  }

  calculateWorklogAmount(
    worklog: WorklogModel,
    startDate: Date,
    endDate: Date,
  ): number {
    try {
      const segments = (worklog.segments ?? []) as Segment[];
      const adjustments = (worklog.adjustments ?? []) as Adjustment[];

      let totalHours = 0;

      for (const seg of segments) {
        if (seg.status !== 'approved') continue;

        const start = new Date(seg.start);
        const end = new Date(seg.end);

        if (end <= start) continue;

        if (start < startDate) continue;
        if (end > endDate) continue;

        totalHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }

      const base = totalHours * Number(worklog.hourly_rate);

      const adjustmentTotal = adjustments.reduce((sum, adj) => {
        const applied = new Date(adj.applied_at);

        if (applied < startDate) return sum;
        if (applied > endDate) return sum;

        return sum + Number(adj.amount);
      }, 0);

      return base + adjustmentTotal;
    } catch {
      return 0;
    }
  }
}
