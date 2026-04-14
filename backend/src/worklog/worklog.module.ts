import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worklog } from './models/worklog.entity';
import { WorkLogSegment } from './models/work-log-segment.entity';
import { Adjustment } from './models/adjustment.entity';
import { WorklogService } from './worklog.service';
import { WorklogRoutes } from './worklog.routes';
import { SettlementModule } from '../settlement/settlement.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Worklog, WorkLogSegment, Adjustment]),
    SettlementModule,
  ],
  providers: [WorklogService],
  controllers: [WorklogRoutes],
})
export class WorklogModule {}
