import { Controller, Get, Query,UseInterceptors } from '@nestjs/common';
import { WorklogService } from './service';
import { WorklogFilterDto } from './schemas';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';

@UseInterceptors(TransformInterceptor)
@Controller('worklogs')
export class WorklogRoutes {
  constructor(private readonly worklogService: WorklogService) {}

  @Get()
  async findAll(@Query() query: WorklogFilterDto) {
    return this.worklogService.getWorklogs(query);
  }
}