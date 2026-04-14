import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/models/user.entity';
import { Worklog } from '../worklog/models/worklog.entity';
import { WorkLogSegment } from '../worklog/models/work-log-segment.entity';
import { Adjustment } from '../worklog/models/adjustment.entity';
import { Remittance } from './models/remittance.entity';
import { RemittanceItem } from './models/remittance-item.entity';
import { SettlementService } from './settlement.service';
import { SettlementRoutes } from './settlement.routes';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Worklog,
      WorkLogSegment,
      Adjustment,
      Remittance,
      RemittanceItem,
    ]),
  ],
  providers: [SettlementService],
  controllers: [SettlementRoutes],
  exports: [SettlementService],
})
export class SettlementModule {}
