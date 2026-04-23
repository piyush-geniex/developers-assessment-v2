import { Module } from '@nestjs/common';
import { SettlementController } from './routes';
import { SettlementService } from './service';

@Module({
  controllers: [SettlementController],
  providers: [SettlementService],
})
export class SettlementModule {}