import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Worklog } from './worklogs/entities/worklog.entity';
import { TimeSegment } from './worklogs/entities/time-segment.entity';
import { Adjustment } from './worklogs/entities/adjustment.entity';
import { Remittance } from './settlement/entities/remittance.entity';
import { WorklogsModule } from './worklogs/worklogs.module';
import { SettlementModule } from './settlement/settlement.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_SERVER ?? 'localhost',
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      username: process.env.POSTGRES_USER ?? 'appuser',
      password: process.env.POSTGRES_PASSWORD ?? 'apppass',
      database: process.env.POSTGRES_DB ?? 'assessment',
      entities: [Worklog, TimeSegment, Adjustment, Remittance],
      synchronize: true,
      poolSize: 10,
    }),
    WorklogsModule,
    SettlementModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    },
  ],
})
export class AppModule {}
