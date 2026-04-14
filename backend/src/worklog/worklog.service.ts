import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorklogResponseDto } from './dto/worklog-response.dto';
import {
  validateRemittanceStatus,
  validateUserId,
  validatePeriodDates,
} from '../common/validators';
import { InvalidRemittanceStatusException } from './worklog.exceptions';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class WorklogService {
  private readonly logger = new Logger(WorklogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get worklogs with optional filters and calculated amounts.
   * Application-level filtering and calculation per AGENTS.md.
   */
  async getWorklogs(filters: {
    remittance_status?: string;
    user_id?: string;
    period_start?: string;
    period_end?: string;
  }): Promise<WorklogResponseDto[]> {
    // Validate remittance_status if provided
    if (filters.remittance_status) {
      try {
        validateRemittanceStatus(filters.remittance_status);
      } catch (error) {
        throw new InvalidRemittanceStatusException(filters.remittance_status);
      }
    }

    // Validate user_id
    const userId = validateUserId(filters.user_id);

    // Validate and parse dates if provided
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (filters.period_start || filters.period_end) {
      if (!filters.period_start || !filters.period_end) {
        throw new Error('Both period_start and period_end must be provided together');
      }
      const dates = validatePeriodDates(filters.period_start, filters.period_end);
      periodStart = dates.period_start;
      periodEnd = dates.period_end;
    }

    // Load all worklogs matching filters (application-level filtering)
    const worklogs = await this.prisma.worklog.findMany({
      where: {
        ...(filters.remittance_status && {
          status: filters.remittance_status === 'REMITTED' ? 'REMITTED' : 'UNREMITTED',
        }),
        ...(userId && { user_id: userId }),
        ...(periodStart && {
          created_at: {
            gte: periodStart,
          },
        }),
        ...(periodEnd && {
          created_at: {
            lte: periodEnd,
          },
        }),
      },
    });

    // Load all records for these worklogs (application-level join)
    const worklogIds = worklogs.map((w) => w.id);
    const records = await this.prisma.record.findMany({
      where: {
        parent_id: {
          in: worklogIds,
        },
      },
    });

    // Calculate amounts: application-level aggregation per AGENTS.md
    const recordsByWorklogId = new Map<number, any[]>();
    records.forEach((rec) => {
      if (!recordsByWorklogId.has(rec.parent_id)) {
        recordsByWorklogId.set(rec.parent_id, []);
      }
      recordsByWorklogId.get(rec.parent_id)!.push(rec);
    });

    return worklogs.map((worklog) => {
      const worklogRecords = recordsByWorklogId.get(worklog.id) || [];

      // Calculate amount from approved segments + adjustments
      let amount = 0;

      // Sum approved segment hours × hourly_rate
      worklogRecords.forEach((rec) => {
        if (rec.type === 'segment' && rec.seg_status === 'approved') {
          const startTime = new Date(rec.start_time);
          const endTime = new Date(rec.end_time);
          const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          amount += hours * Number(worklog.hourly_rate);
        }
      });

      // Add adjustment amounts (positive or negative)
      worklogRecords.forEach((rec) => {
        if (rec.type === 'adjustment') {
          const payload = rec.payload as any;
          amount += payload.amount || 0;
        }
      });

      return {
        id: worklog.id,
        external_id: worklog.external_id,
        user_id: worklog.user_id,
        user_name: worklog.user_name,
        task_name: worklog.task_name,
        hourly_rate: Number(worklog.hourly_rate),
        amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
        status: worklog.status,
        remittance_id: worklog.remittance_id,
        created_at: worklog.created_at.toISOString(),
      };
    });
  }
}
