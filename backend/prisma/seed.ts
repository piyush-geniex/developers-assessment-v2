import { PrismaClient, TimeSegmentStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
    const existing = await prisma.workLog.count();
    if (existing > 0) {
        console.log(`🌱 Seed skipped (worklogs already present: ${existing})`);
        return;
    }

    const filePath = path.resolve(__dirname, '../../seed/worklogs.json');
    if (!fs.existsSync(filePath)) {
        throw new Error(`Seed file not found at ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    for (const item of data) {
        const worker = await prisma.worker.upsert({
            where: { email: `${item.user_id}@test.com` },
            update: {},
            create: {
                email: `${item.user_id}@test.com`,
                name: item.user_name,
            },
        });

        const task = await prisma.task.create({
            data: {
                name: item.task_name,
                description: item.task_name,
            },
        });

        const worklog = await prisma.workLog.create({
            data: {
                workerId: worker.id,
                taskId: task.id,
                status: 'OPEN',
            },
        });

        const segmentMap: Record<string, string> = {};

        for (const segment of item.segments) {
            const start = new Date(segment.start);
            const end = new Date(segment.end);

            const minutes = (end.getTime() - start.getTime()) / (1000 * 60);

            let status: TimeSegmentStatus = 'ACTIVE';
            if (segment.status === 'disputed') status = 'DISPUTED';
            if (segment.status === 'cancelled') status = 'REMOVED';

            const createdSegment = await prisma.timeSegment.create({
                data: {
                    workLogId: worklog.id,
                    startTime: start,
                    endTime: end,
                    minutesDuration: minutes,
                    hourlyRateSnapshot: item.hourly_rate,
                    status,
                },
            });

            segmentMap[segment.segment_id] = createdSegment.id;
        }

        for (const adjustment of item.adjustments || []) {
            const segmentIds = Object.values(segmentMap);

            const timeSegmentId =
                segmentIds.length > 0
                    ? segmentIds[Math.floor(Math.random() * segmentIds.length)]
                    : null;

            await prisma.adjustment.create({
                data: {
                    workerId: worker.id,
                    timeSegmentId,
                    amount: adjustment.amount,
                    reason: adjustment.reason,
                    effectiveDate: new Date(adjustment.applied_at),
                },
            });
        }
    }

    console.log('🌱 Seed completed (corrected relationships)');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
