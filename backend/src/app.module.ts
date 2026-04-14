import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WorklogModule } from './worklog/worklog.module';
import { SettlementModule } from './settlement/settlement.module';

@Module({
  imports: [PrismaModule, WorklogModule, SettlementModule],
})
export class AppModule {}
