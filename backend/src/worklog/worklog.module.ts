import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemittanceLineEntity } from '../settlement/remittance-line.entity';
import { WorklogController } from './worklog.controller';
import { WorklogEntity } from './worklog.entity';
import { WorklogService } from './worklog.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorklogEntity, RemittanceLineEntity])],
  controllers: [WorklogController],
  providers: [WorklogService],
  exports: [TypeOrmModule],
})
export class WorklogModule {}
