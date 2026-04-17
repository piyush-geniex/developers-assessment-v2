import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetWorklogsDto } from './dto/get-worklogs.dto';
import {
  computeAmounts,
  fetchWorklogs,
  parsePeriod,
  toWorklogResponses,
} from './worklog.calculation';

@Injectable()
export class WorklogService {
  constructor(private prisma: PrismaService) {}

  async getWorklogs(query: GetWorklogsDto) {
    const { remittance_status, user_id, period_start, period_end } = query;

    const { periodStart, periodEnd } = parsePeriod({
      period_start,
      period_end,
    });

    const worklogs = await fetchWorklogs(this.prisma, {
      user_id,
      periodStart,
      periodEnd,
    });

    if (worklogs.length === 0) return [];

    const worklogIds = worklogs.map((wl) => wl.id);

    const amountByWorklogId = await computeAmounts(
      this.prisma,
      remittance_status,
      {
        worklogIds,
        periodStart,
        periodEnd,
      },
    );

    return toWorklogResponses(worklogs, amountByWorklogId, {
      onlyWithAmount: remittance_status === 'REMITTED',
    });
  }
}
