import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorklogEntity } from '../worklog/worklog.entity';
import { RemittanceLineEntity } from './remittance-line.entity';
import { RemittanceEntity } from './remittance.entity';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorklogEntity,
      RemittanceEntity,
      RemittanceLineEntity,
    ]),
  ],
  controllers: [SettlementController],
  providers: [SettlementService],
})
export class SettlementModule {}
