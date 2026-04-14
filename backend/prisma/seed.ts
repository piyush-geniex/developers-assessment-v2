import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface Segment {
  segment_id: string;
  start: string;
  end: string;
  status: string;
  dispute_reason?: string;
}

interface Adjustment {
  adjustment_id: string;
  amount: number;
  reason: string;
  applied_at: string;
}

interface WorklogData {
  worklog_id: string;
  user_id: string;
  user_name: string;
  task_name: string;
  hourly_rate: number;
  segments: Segment[];
  adjustments: Adjustment[];
}

async function main() {
  try {
    // Read seed data
    const seedPath = path.join(__dirname, '../..', 'seed', 'worklogs.json');
    const seedData: WorklogData[] = JSON.parse(
      fs.readFileSync(seedPath, 'utf-8'),
    );

    console.log(`Seeding ${seedData.length} worklogs...`);

    for (const worklogData of seedData) {
      // Create worklog
      const worklog = await prisma.worklog.create({
        data: {
          external_id: worklogData.worklog_id,
          user_id: worklogData.user_id,
          user_name: worklogData.user_name,
          task_name: worklogData.task_name,
          hourly_rate: new Prisma.Decimal(worklogData.hourly_rate),
          segment_ids: [],
          adjustment_ids: [],
          status: 'UNREMITTED',
        },
      });

      const segmentIds: number[] = [];
      const adjustmentIds: number[] = [];

      // Create segment records
      for (const segment of worklogData.segments) {
        const record = await prisma.record.create({
          data: {
            type: 'segment',
            parent_id: worklog.id,
            payload: {
              segment_id: segment.segment_id,
              dispute_reason: segment.dispute_reason || null,
            },
            start_time: new Date(segment.start),
            end_time: new Date(segment.end),
            seg_status: segment.status,
            created_at: new Date(),
          },
        });
        segmentIds.push(record.id);
      }

      // Create adjustment records
      for (const adjustment of worklogData.adjustments) {
        const record = await prisma.record.create({
          data: {
            type: 'adjustment',
            parent_id: worklog.id,
            payload: {
              adjustment_id: adjustment.adjustment_id,
              amount: adjustment.amount,
              reason: adjustment.reason,
            },
            applied_at: new Date(adjustment.applied_at),
            created_at: new Date(),
          },
        });
        adjustmentIds.push(record.id);
      }

      // Update worklog with record IDs
      await prisma.worklog.update({
        where: { id: worklog.id },
        data: {
          segment_ids: segmentIds,
          adjustment_ids: adjustmentIds,
        },
      });

      console.log(
        `Created worklog ${worklogData.worklog_id} with ${segmentIds.length} segments and ${adjustmentIds.length} adjustments`,
      );
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Need to import Prisma for Decimal
import { Prisma } from '@prisma/client';

main();
