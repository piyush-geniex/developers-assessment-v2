import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { GenerateRemittanceDto } from './dto/generate-remittance.dto';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementSourceType } from '@prisma/client';

type SettlementLine = {
  settlementAttemptId: string;
  workerId: string;
  sourceType: SettlementSourceType;
  sourceId: string;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
};

@Injectable()
export class SettlementService {
  constructor(private prisma: PrismaService) {}

  async generateRemittances(dto: GenerateRemittanceDto) {
    const periodStart = new Date(dto.period_start);
    const periodEnd = new Date(dto.period_end);

    if (
      Number.isNaN(periodStart.valueOf()) ||
      Number.isNaN(periodEnd.valueOf())
    ) {
      throw new BadRequestException('Invalid period format');
    }

    if (periodStart >= periodEnd) {
      throw new BadRequestException('Invalid period range');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingAttempt = await tx.settlementAttempt.findUnique({
        where: {
          periodStart_periodEnd: {
            periodStart,
            periodEnd,
          },
        },
      });

      if (existingAttempt) {
        throw new ConflictException(
          'Settlement already exists for this period',
        );
      }

      const settlementAttempt = await tx.settlementAttempt.create({
        data: {
          periodStart,
          periodEnd,
          status: 'PENDING',
        },
      });

      const unsettledTimeSegments = await tx.timeSegment.findMany({
        where: {
          status: 'ACTIVE',
          startTime: {
            gte: periodStart,
            lte: periodEnd,
          },
          settlementLines: {
            none: {},
          },
        },
        include: {
          workLog: true,
        },
      });
      const unsettledAdjustments = await tx.adjustment.findMany({
        where: {
          effectiveDate: {
            lte: periodEnd,
          },
          settlementLines: {
            none: {},
          },
        },
      });

      const settlementLinesData: SettlementLine[] = [];

      for (const segment of unsettledTimeSegments) {
        const amount =
          (segment.minutesDuration / 60) * Number(segment.hourlyRateSnapshot);

        settlementLinesData.push({
          settlementAttemptId: settlementAttempt.id,
          workerId: segment.workLog.workerId,
          sourceType: SettlementSourceType.TIME_SEGMENT,
          sourceId: segment.id,
          amount,
          periodStart,
          periodEnd,
        });
      }

      for (const adj of unsettledAdjustments) {
        settlementLinesData.push({
          settlementAttemptId: settlementAttempt.id,
          workerId: adj.workerId,
          sourceType: SettlementSourceType.ADJUSTMENT,
          sourceId: adj.id,
          amount: Number(adj.amount),
          periodStart,
          periodEnd,
        });
      }

      if (settlementLinesData.length > 0) {
        await tx.settlementLine.createMany({
          data: settlementLinesData,
          skipDuplicates: true,
        });
      }

      const totals = await tx.settlementLine.groupBy({
        by: ['workerId'],
        where: {
          settlementAttemptId: settlementAttempt.id,
        },
        _sum: {
          amount: true,
        },
      });

      const remittancesData = totals.map((t) => ({
        workerId: t.workerId,
        settlementAttemptId: settlementAttempt.id,
        totalAmount: t._sum.amount || 0,
        status: 'PENDING' as const,
      }));

      if (remittancesData.length > 0) {
        await tx.remittance.createMany({
          data: remittancesData,
        });
      }

      await tx.settlementAttempt.update({
        where: { id: settlementAttempt.id },
        data: { status: 'COMPLETED' },
      });

      return {
        settlementAttemptId: settlementAttempt.id,
        workersPaid: remittancesData.length,
      };
    });
  }
}
