import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { Worklog } from '../worklogs/entities/worklog.entity';
import { TimeSegment } from '../worklogs/entities/time-segment.entity';
import { Adjustment } from '../worklogs/entities/adjustment.entity';
import { Remittance } from '../settlement/entities/remittance.entity';

const seedData: any[] = require(
  path.resolve(__dirname, process.env.SEED_JSON_PATH ?? '../../seed-data/worklogs.json'),
);

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_SERVER ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  username: process.env.POSTGRES_USER ?? 'appuser',
  password: process.env.POSTGRES_PASSWORD ?? 'apppass',
  database: process.env.POSTGRES_DB ?? 'assessment',
  entities: [Worklog, TimeSegment, Adjustment, Remittance],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();

  const worklogRepo = dataSource.getRepository(Worklog);
  const count = await worklogRepo.count();

  if (count > 0) {
    console.log(`Seed skipped — ${count} worklogs already exist.`);
    await dataSource.destroy();
    return;
  }

  for (const row of seedData) {
    const worklog = worklogRepo.create({
      external_id: row.worklog_id,
      user_id: row.user_id,
      user_name: row.user_name,
      task_name: row.task_name,
      hourly_rate: row.hourly_rate,
      remittance_status: 'UNREMITTED',
      segments: (row.segments ?? []).map((s: any) => ({
        external_id: s.segment_id,
        started_at: new Date(s.start),
        ended_at: new Date(s.end),
        status: s.status,
        dispute_reason: s.dispute_reason ?? null,
      })),
      adjustments: (row.adjustments ?? []).map((a: any) => ({
        external_id: a.adjustment_id,
        amount: a.amount,
        reason: a.reason,
        applied_at: new Date(a.applied_at),
        settled_in_remittance_id: null,
      })),
    });

    await worklogRepo.save(worklog);
    console.log(`Seeded: ${row.worklog_id} — ${row.task_name}`);
  }

  console.log('Seed complete.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
