import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { SettlementModule } from './settlement';
import { UserModule } from './user';
import { WorklogModule } from './worklog';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
    DatabaseModule,
    HealthModule,
    UserModule,
    WorklogModule,
    SettlementModule,
  ],
})
export class AppModule {}
