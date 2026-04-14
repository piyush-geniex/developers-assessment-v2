import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { WorklogService } from './worklog.service';
import { WorklogQuerySchema } from './schemas/worklog-query.schema';

@Controller()
export class WorklogRoutes {
  constructor(private readonly worklogService: WorklogService) {}

  @Get('worklogs')
  async listWorklogs(@Query() query: WorklogQuerySchema) {
    const hasPs = query.period_start != null;
    const hasPe = query.period_end != null;
    if (hasPs !== hasPe) {
      throw new BadRequestException('period_start and period_end must be used together');
    }
    return this.worklogService.listWorklogs({
      remittanceStatus: query.remittance_status,
      userId: query.user_id,
      periodStart: query.period_start,
      periodEnd: query.period_end,
    });
  }
}
