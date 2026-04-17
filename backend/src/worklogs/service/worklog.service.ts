import { Injectable } from '@nestjs/common';
import { AppDataSource } from '../../database/data-source';
import { WorklogModel } from '../models/worklog.model';
import { GetWorklogsQuery } from '../schemas/get-worklogs.schema';

type Segment = {
  start: string;
  end: string;
  status: string;
};

type Adjustment = {
  amount: number;
  applied_at: string;
};

@Injectable()
export class WorklogService {
  private repo = AppDataSource.getRepository(WorklogModel);

  async getWorklogs(filters: GetWorklogsQuery) {
    try {
      const qb = this.repo.createQueryBuilder('w');

      // filter: remittance status
      if (filters.remittance_status) {
        qb.andWhere('w.remittance_status = :status', {
          status: filters.remittance_status,
        });
      }

      // filter: user
      if (filters.user_id) {
        qb.andWhere('w.user_id = :user_id', {
          user_id: filters.user_id,
        });
      }

      const worklogs = await qb.getMany();

      // apply period filter at application level (AGENTS.md rule)
      return worklogs.map((w) => ({
        ...w,
        total_amount: this.calculateWorklogAmount(
          w,
          filters.period_start,
          filters.period_end,
        ),
      }));
    } catch (error) {
      console.error('Worklog fetch error:', error);
      throw new Error('Failed to fetch worklogs');
    }
  }

  calculateWorklogAmount(
    worklog: WorklogModel,
    period_start?: string,
    period_end?: string,
  ): number {
    try {
      const segments = (worklog.segments ?? []) as Segment[];
      const adjustments = (worklog.adjustments ?? []) as Adjustment[];

      let totalHours = 0;

      // segment filtering
      for (const seg of segments) {
        if (seg.status !== 'approved') continue;

        const start = new Date(seg.start);
        const end = new Date(seg.end);

        // ignore invalid segments (edge case from seed data)
        if (end <= start) continue;

        // period filtering (IMPORTANT requirement)
        if (period_start && start < new Date(period_start)) continue;
        if (period_end && end > new Date(period_end)) continue;

        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        totalHours += hours;
      }

      const baseAmount = totalHours * Number(worklog.hourly_rate);

      // adjustments filtering (based on applied_at)
      const adjustmentTotal = adjustments.reduce((sum, adj) => {
        const appliedDate = new Date(adj.applied_at);

        if (period_start && appliedDate < new Date(period_start)) return sum;
        if (period_end && appliedDate > new Date(period_end)) return sum;

        return sum + Number(adj.amount);
      }, 0);

      return baseAmount + adjustmentTotal;
    } catch (error) {
      console.error('Worklog amount calculation error:', error);
      return 0;
    }
  }
}
