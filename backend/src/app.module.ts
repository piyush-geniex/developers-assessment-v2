import { Module } from '@nestjs/common';
import { WorklogRoutes } from './worklogs/routes/worklog.routes';
import { WorklogService } from './worklogs/service/worklog.service';
import { SettlementRoutes } from './settlement/routes/settlement.routes';
import { SettlementService } from './settlement/service/settlement.service';
import { RemittanceRoutes } from './remittance/routes/remittance.routes';
import { RemittanceService } from './remittance/service/remittance.service';

@Module({
  controllers: [WorklogRoutes, SettlementRoutes, RemittanceRoutes],
  providers: [WorklogService, SettlementService, RemittanceService],
})
export class AppModule {}
