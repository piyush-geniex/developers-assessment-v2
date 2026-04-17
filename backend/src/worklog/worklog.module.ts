import { Module } from '@nestjs/common';
import { WorklogController } from './worklog.controller';
import { WorklogService } from './worklog.service';

@Module({
  controllers: [WorklogController],
  providers: [WorklogService],
})
export class WorklogModule {}
