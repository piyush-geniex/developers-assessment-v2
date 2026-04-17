import { Controller, Get, Query } from '@nestjs/common';
import { WorklogService } from '../service/worklog.service';

@Controller('worklogs')
export class WorklogRoutes {
  constructor(private readonly worklogService: WorklogService) {}

  @Get()
  async getWorklogs(@Query() query: any) {
    const data = await this.worklogService.getWorklogs(query);

    return {
      data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}
