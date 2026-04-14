/**
 * Loads repository root `seed/worklogs.json` into the database.
 * Run: npm run seed (from backend/)
 */
import * as fs from 'fs';
import * as path from 'path';
import dataSource from '../database/data-source';
import { AdjustmentType } from '../worklog/models/adjustment-type.enum';

interface SeedSegment {
  segment_id: string;
  start: string;
  end: string;
  status: string;
}

interface SeedAdjustment {
  adjustment_id: string;
  amount: number;
  reason: string;
  applied_at: string;
}

interface SeedWorklog {
  worklog_id: string;
  user_id: string;
  user_name: string;
  task_name: string;
  hourly_rate: number;
  segments: SeedSegment[];
  adjustments: SeedAdjustment[];
}

function minutesBetween(isoStart: string, isoEnd: string): number {
  const a = new Date(isoStart).getTime();
  const b = new Date(isoEnd).getTime();
  return Math.max(0, Math.round((b - a) / 60000));
}

function earnedDateUtc(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function resolveSeedPath(): string {
  const fromCwd = path.join(process.cwd(), 'seed', 'worklogs.json');
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(__dirname, '../../../seed/worklogs.json');
}

async function run() {
  const seedPath = resolveSeedPath();
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const rows = JSON.parse(raw) as SeedWorklog[];

  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(`TRUNCATE remittance_item, remittance, adjustment, work_log_segment, worklog, users RESTART IDENTITY CASCADE`);

    const userMap = new Map<string, number>();
    for (const row of rows) {
      if (!userMap.has(row.user_id)) {
        const res = await qr.query(
          `INSERT INTO users (name) VALUES ($1) RETURNING id`,
          [row.user_name],
        );
        userMap.set(row.user_id, res[0].id as number);
      }
    }

    for (const row of rows) {
      const uid = userMap.get(row.user_id)!;
      const wl = await qr.query(
        `INSERT INTO worklog (user_id, task_id, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [uid, row.task_name],
      );
      const worklogId = wl[0].id as number;

      const segmentIdMap = new Map<string, number>();

      for (const seg of row.segments) {
        if (seg.status !== 'approved') {
          continue;
        }
        const dur = minutesBetween(seg.start, seg.end);
        if (dur <= 0) {
          continue;
        }
        const ins = await qr.query(
          `INSERT INTO work_log_segment (worklog_id, duration_minutes, rate, amount, earned_at)
           VALUES ($1, $2, $3, NULL, $4) RETURNING id`,
          [worklogId, dur, String(row.hourly_rate), earnedDateUtc(seg.start)],
        );
        segmentIdMap.set(seg.segment_id, ins[0].id as number);
      }

      for (const adj of row.adjustments) {
        const t =
          adj.amount >= 0 ? AdjustmentType.ADD : AdjustmentType.DEDUCT;
        await qr.query(
          `INSERT INTO adjustment (worklog_id, type, amount_delta, reason, created_at, applies_to_segment_id)
           VALUES ($1, $2, $3, $4, $5::timestamptz, NULL)`,
          [
            worklogId,
            t,
            String(adj.amount),
            adj.reason,
            new Date(adj.applied_at).toISOString(),
          ],
        );
      }
    }

    await qr.commitTransaction();
    console.log('Seed completed.');
  } catch (e) {
    await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
