import { Controller, Get, Query } from '@nestjs/common';
import { ListWorklogsQueryDto } from './dto/list-worklogs-query.dto';
import { WorklogService } from './worklog.service';

@Controller()
export class WorklogController {
  constructor(private readonly worklogService: WorklogService) {}

  @Get('worklogs')
  async list(@Query() query: ListWorklogsQueryDto) {
    return this.worklogService.list(query);
  }
}
