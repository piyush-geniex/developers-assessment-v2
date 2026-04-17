import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {ConfigModule} from "@nestjs/config";
import {PrismaModule} from "./prisma/prisma.module";
import { SettlementController } from './settlement/settlement.controller';
import { SettlementService } from './settlement/settlement.service';
import { WorklogController } from './worklog/worklog.controller';
import { WorklogService } from './worklog/worklog.service';
import { WorklogModule } from './worklog/worklog.module';
import { SettlementModule } from './settlement/settlement.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    WorklogModule,
    SettlementModule,
  ],
  controllers: [AppController, SettlementController, WorklogController],
  providers: [AppService, SettlementService, WorklogService],
})
export class AppModule {}
