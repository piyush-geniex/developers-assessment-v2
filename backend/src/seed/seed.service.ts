import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { WorklogEntity } from '../worklog/worklog.entity';
import type { AdjustmentRecord, SegmentRecord } from '../worklog/worklog.types';

interface SeedRow {
  worklog_id: string;
  user_id: string;
  user_name: string;
  task_name: string;
  hourly_rate: number;
  segments: SegmentRecord[];
  adjustments?: AdjustmentRecord[];
}

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(WorklogEntity)
    private readonly worklogRepo: Repository<WorklogEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.worklogRepo.count();
    if (count > 0) {
      return;
    }

    const path = this.resolveSeedPath();
    if (!path) {
      this.logger.warn('No seed file found; skipping seed.');
      return;
    }

    const raw = readFileSync(path, 'utf-8');
    const rows = JSON.parse(raw) as SeedRow[];

    for (const row of rows) {
      const entity = this.worklogRepo.create({
        externalId: row.worklog_id,
        userId: row.user_id,
        userName: row.user_name,
        taskName: row.task_name,
        hourlyRate: String(row.hourly_rate),
        segments: row.segments ?? [],
        adjustments: row.adjustments ?? [],
      });
      await this.worklogRepo.save(entity);
    }

    this.logger.log(`Seeded ${rows.length} worklogs from ${path}`);
  }

  private resolveSeedPath(): string | null {
    const envPath = process.env.SEED_PATH;
    if (envPath && existsSync(envPath)) {
      return envPath;
    }
    const candidates = [
      '/app/seed/worklogs.json',
      join(process.cwd(), 'seed', 'worklogs.json'),
      join(process.cwd(), '..', 'seed', 'worklogs.json'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
