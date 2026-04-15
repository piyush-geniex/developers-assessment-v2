import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Remittance } from './entities/remittance.entity';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';
import { WorklogsModule } from '../worklogs/worklogs.module';

@Module({
  imports: [TypeOrmModule.forFeature([Remittance]), WorklogsModule],
  providers: [SettlementService],
  controllers: [SettlementController],
})
export class SettlementModule {}
