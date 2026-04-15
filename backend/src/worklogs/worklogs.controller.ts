import { Controller, Get, Query } from '@nestjs/common';
import { WorklogsService } from './worklogs.service';
import { QueryWorklogsDto } from './dto/query-worklogs.dto';

@Controller('worklogs')
export class WorklogsController {
  constructor(private readonly worklogsService: WorklogsService) {}

  @Get()
  async findAll(@Query() query: QueryWorklogsDto) {
    const data = await this.worklogsService.findAll(query);
    return {
      data,
      meta: {
        total: data.length,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
