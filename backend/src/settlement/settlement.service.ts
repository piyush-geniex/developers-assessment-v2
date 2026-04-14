import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateRemittancesResponseDto, RemittanceDto } from './dto/remittance-response.dto';
import { RemittanceAlreadyExistsException, InvalidPeriodException } from './settlement.exceptions';
import { validatePeriodDates } from '../common/validators';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate remittances for a given period.
   * Per AGENTS.md:
   * 1. Find all approved segments in period
   * 2. Get distinct worklogs
   * 3. Load UNREMITTED worklogs
   * 4. Load adjustments for those worklogs
   * 5. Sweep prior-period adjustments from REMITTED worklogs
   * 6. Calculate totals per user
   * 7. Update worklog status (separate await - granular commit)
   * 8. Create remittance
   * 9. Mark adjustment records with remittance_id
   * 10. Return batch summary with 409 if duplicate exists
   */
  async generateRemittances(
    period_start: string,
    period_end: string,
  ): Promise<GenerateRemittancesResponseDto> {
    // Validate dates
    let startDate: Date;
    let endDate: Date;
    try {
      const dates = validatePeriodDates(period_start, period_end);
      startDate = dates.period_start;
      endDate = dates.period_end;
    } catch (error) {
      throw new InvalidPeriodException((error as Error).message);
    }

    // Step 1-2: Find all approved segments in period and get distinct worklog IDs
    const approvedSegments = await this.prisma.record.findMany({
      where: {
        type: 'segment',
        seg_status: 'approved',
        start_time: {
          gte: startDate,
        },
        end_time: {
          lte: endDate,
        },
      },
    });

    const worklogIdsFromSegments = new Set(
      approvedSegments.map((seg) => seg.parent_id),
    );

    if (worklogIdsFromSegments.size === 0) {
      // No approved segments in period, return empty result
      return {
        remittances: [],
        summary: { succeeded: 0, failed: 0, errors: [] },
      };
    }

    // Step 3: Load UNREMITTED worklogs for these IDs
    const unremittedWorklogs = await this.prisma.worklog.findMany({
      where: {
        id: {
          in: Array.from(worklogIdsFromSegments),
        },
        status: 'UNREMITTED',
      },
    });

    // Step 4: Load all adjustments for these worklogs (remittance_id IS NULL)
    const adjustmentsForWorklogs = await this.prisma.record.findMany({
      where: {
        type: 'adjustment',
        parent_id: {
          in: unremittedWorklogs.map((w) => w.id),
        },
        remittance_id: null,
      },
    });

    // Step 5: Sweep prior-period adjustments from REMITTED worklogs
    // Get user IDs from unremitted worklogs
    const userIds = new Set(unremittedWorklogs.map((w) => w.user_id));

    // Find REMITTED worklogs for these users
    const remittedWorklogs = await this.prisma.worklog.findMany({
      where: {
        user_id: {
          in: Array.from(userIds),
        },
        status: 'REMITTED',
      },
    });

    // Load adjustments on REMITTED worklogs that haven't been assigned to a remittance
    const priorAdjustments = await this.prisma.record.findMany({
      where: {
        type: 'adjustment',
        parent_id: {
          in: remittedWorklogs.map((w) => w.id),
        },
        remittance_id: null,
      },
    });

    // Step 6: Calculate totals per user
    const userDataMap = new Map<
      string,
      {
        amount: number;
        worklogIds: number[];
        adjustmentRecordIds: number[];
      }
    >();

    // Group unremitted worklogs and their segments by user
    unremittedWorklogs.forEach((worklog) => {
      if (!userDataMap.has(worklog.user_id)) {
        userDataMap.set(worklog.user_id, {
          amount: 0,
          worklogIds: [],
          adjustmentRecordIds: [],
        });
      }
      const userData = userDataMap.get(worklog.user_id)!;
      userData.worklogIds.push(worklog.id);

      // Calculate amount for this worklog: approved segments
      approvedSegments.forEach((seg) => {
        if (seg.parent_id === worklog.id) {
          const startTime = new Date(seg.start_time!);
          const endTime = new Date(seg.end_time!);
          const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          userData.amount += hours * Number(worklog.hourly_rate);
        }
      });

      // Add adjustments for this worklog
      adjustmentsForWorklogs.forEach((adj) => {
        if (adj.parent_id === worklog.id) {
          const payload = adj.payload as any;
          userData.amount += payload.amount || 0;
          userData.adjustmentRecordIds.push(adj.id);
        }
      });
    });

    // Add prior-period adjustments per user
    priorAdjustments.forEach((adj) => {
      const remittedWl = remittedWorklogs.find((w) => w.id === adj.parent_id);
      if (remittedWl) {
        const userData = userDataMap.get(remittedWl.user_id);
        if (userData) {
          const payload = adj.payload as any;
          userData.amount += payload.amount || 0;
          userData.adjustmentRecordIds.push(adj.id);
        }
      }
    });

    // Pre-flight idempotency check: if ANY user in this batch already has a remittance
    // for the same period, reject the entire run with 409 before touching any data.
    const userIds = Array.from(userDataMap.keys());
    const existingForPeriod = await this.prisma.remittance.findMany({
      where: {
        user_id: { in: userIds },
        period_start: startDate,
        period_end: endDate,
      },
    });
    if (existingForPeriod.length > 0) {
      throw new RemittanceAlreadyExistsException(
        existingForPeriod[0].user_id,
        period_start,
        period_end,
      );
    }

    // Step 7-9: For each user, update worklogs, create remittance, mark adjustments
    const remittances: RemittanceDto[] = [];
    const errors: Array<{ user_id: string; reason: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const [userId, userData] of userDataMap.entries()) {
      try {

        // Step 7: Update worklogs to REMITTED (granular commit per AGENTS.md)
        await this.prisma.worklog.updateMany({
          where: {
            id: {
              in: userData.worklogIds,
            },
          },
          data: {
            status: 'REMITTED',
          },
        });

        // Step 8: Create remittance (separate await - granular commit)
        const remittance = await this.prisma.remittance.create({
          data: {
            user_id: userId,
            period_start: startDate,
            period_end: endDate,
            amount: new Decimal(
              Math.round(userData.amount * 100) / 100,
            ),
            status: 'PENDING',
            worklog_ids: userData.worklogIds,
          },
        });

        // Step 9a: Write remittance_id back to worklogs (separate await - granular commit)
        await this.prisma.worklog.updateMany({
          where: { id: { in: userData.worklogIds } },
          data: { remittance_id: remittance.id },
        });

        // Step 9b: Mark adjustment records with remittance_id
        if (userData.adjustmentRecordIds.length > 0) {
          await this.prisma.record.updateMany({
            where: {
              id: {
                in: userData.adjustmentRecordIds,
              },
            },
            data: {
              remittance_id: remittance.id,
            },
          });
        }

        remittances.push({
          id: remittance.id,
          user_id: remittance.user_id,
          period_start: remittance.period_start.toISOString().split('T')[0],
          period_end: remittance.period_end.toISOString().split('T')[0],
          amount: Number(remittance.amount),
          status: remittance.status,
          worklog_ids: remittance.worklog_ids as number[],
          created_at: remittance.created_at.toISOString(),
        });

        succeeded++;
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Settlement failed for user ${userId}: ${errorMessage}`,
          error,
        );
        errors.push({
          user_id: userId,
          reason: errorMessage,
        });
      }
    }

    return {
      remittances,
      summary: {
        succeeded,
        failed,
        errors,
      },
    };
  }
}
