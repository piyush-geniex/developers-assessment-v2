import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorklogEntity } from '../worklog/worklog.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorklogEntity])],
  providers: [SeedService],
})
export class SeedModule {}
