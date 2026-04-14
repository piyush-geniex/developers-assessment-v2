import { Module } from '@nestjs/common';
import { WorklogController } from './worklog.controller';
import { WorklogService } from './worklog.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorklogController],
  providers: [WorklogService],
  exports: [WorklogService],
})
export class WorklogModule {}
