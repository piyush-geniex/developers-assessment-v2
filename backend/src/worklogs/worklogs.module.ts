import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worklog } from './entities/worklog.entity';
import { TimeSegment } from './entities/time-segment.entity';
import { Adjustment } from './entities/adjustment.entity';
import { WorklogsService } from './worklogs.service';
import { WorklogsController } from './worklogs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Worklog, TimeSegment, Adjustment])],
  providers: [WorklogsService],
  controllers: [WorklogsController],
  exports: [WorklogsService],
})
export class WorklogsModule {}
