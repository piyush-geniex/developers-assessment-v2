import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Adjustment } from '../worklog/models/adjustment.entity';
import { WorkLogSegment } from '../worklog/models/work-log-segment.entity';
import { Worklog } from '../worklog/models/worklog.entity';
import { RemittanceItem } from '../settlement/models/remittance-item.entity';
import { Remittance } from '../settlement/models/remittance.entity';
import { User } from '../user/models/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        entities: [User, Worklog, WorkLogSegment, Adjustment, Remittance, RemittanceItem],
        synchronize: process.env.TYPEORM_SYNC === 'true',
        logging: process.env.TYPEORM_LOGGING === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
