import type { PrismaService } from '../prisma/prisma.service';

export type Period = {
  periodStart?: Date;
  periodEnd?: Date;
};

export type WorklogRow = {
  id: string;
  workerId: string;
  taskId: string;
  worker: { email: string; name: string };
  task: { name: string; description: string };
};

export function parsePeriod(input: {
  period_start?: string;
  period_end?: string;
}): Period {
  const periodStart = input.period_start
    ? new Date(input.period_start)
    : undefined;
  const periodEnd = input.period_end ? new Date(input.period_end) : undefined;
  return { periodStart, periodEnd };
}

export async function fetchWorklogs(
  prisma: PrismaService,
  input: { user_id?: string; periodStart?: Date; periodEnd?: Date },
): Promise<WorklogRow[]> {
  const worklogWhere: any = {};
  if (input.user_id) {
    worklogWhere.workerId = input.user_id;
  }

  if (input.periodStart || input.periodEnd) {
    const timeSegmentWhere: any = {};
    if (input.periodStart)
      timeSegmentWhere.startTime = { gte: input.periodStart };
    if (input.periodEnd) timeSegmentWhere.endTime = { lte: input.periodEnd };
    worklogWhere.timeSegments = { some: timeSegmentWhere };
  }

  return prisma.workLog.findMany({
    where: worklogWhere,
    select: {
      id: true,
      workerId: true,
      taskId: true,
      worker: { select: { email: true, name: true } },
      task: { select: { name: true, description: true } },
    },
  }) as any;
}

function buildTimeSegmentBaseWhere(input: {
  worklogIds: string[];
  periodStart?: Date;
  periodEnd?: Date;
}): any {
  const where: any = { workLogId: { in: input.worklogIds } };
  if (input.periodStart) where.startTime = { gte: input.periodStart };
  if (input.periodEnd) where.endTime = { lte: input.periodEnd };
  return where;
}

function addAmount(map: Map<string, number>, worklogId: string, delta: number) {
  const prev = map.get(worklogId) ?? 0;
  map.set(worklogId, prev + delta);
}

export function toWorklogResponses(
  worklogs: WorklogRow[],
  amountByWorklogId: Map<string, number>,
  options: { onlyWithAmount: boolean },
) {
  const rows = options.onlyWithAmount
    ? worklogs.filter((wl) => amountByWorklogId.has(wl.id))
    : worklogs;

  return rows.map((wl) => ({
    id: wl.id,
    amount: amountByWorklogId.get(wl.id) ?? 0,
    worker: {
      id: wl.workerId,
      email: wl.worker.email,
      name: wl.worker.name,
    },
    task: {
      id: wl.taskId,
      name: wl.task.name,
      description: wl.task.description,
    },
  }));
}

export function computeAmounts(
  prisma: PrismaService,
  remittance_status: 'REMITTED' | 'UNREMITTED',
  input: { worklogIds: string[]; periodStart?: Date; periodEnd?: Date },
) {
  return remittance_status === 'REMITTED'
    ? computeRemittedAmounts(prisma, input)
    : computeUnremittedAmounts(prisma, input);
}

async function computeRemittedAmounts(
  prisma: PrismaService,
  input: { worklogIds: string[]; periodStart?: Date; periodEnd?: Date },
): Promise<Map<string, number>> {
  const amountByWorklogId = new Map<string, number>();
  const timeSegmentBaseWhere = buildTimeSegmentBaseWhere(input);

  const segments = await prisma.timeSegment.findMany({
    where: timeSegmentBaseWhere,
    select: { id: true, workLogId: true },
  });

  if (segments.length === 0) return amountByWorklogId;

  const segmentIdToWorklogId = new Map<string, string>();
  for (const s of segments) segmentIdToWorklogId.set(s.id, s.workLogId);

  const settlementLines = await prisma.settlementLine.findMany({
    where: {
      sourceType: 'TIME_SEGMENT',
      sourceId: { in: segments.map((s) => s.id) },
    },
    select: {
      sourceId: true,
      settlementAttemptId: true,
      workerId: true,
      amount: true,
    },
  });

  if (settlementLines.length === 0) return amountByWorklogId;

  const attemptIds = Array.from(
    new Set(settlementLines.map((sl) => sl.settlementAttemptId)),
  );
  const workerIds = Array.from(
    new Set(settlementLines.map((sl) => sl.workerId)),
  );

  const remittances =
    attemptIds.length === 0 || workerIds.length === 0
      ? []
      : await prisma.remittance.findMany({
          where: {
            settlementAttemptId: { in: attemptIds },
            workerId: { in: workerIds },
          },
          select: { settlementAttemptId: true, workerId: true },
        });

  const remittancePairs = new Set(
    remittances.map((r) => `${r.settlementAttemptId}:${r.workerId}`),
  );

  for (const sl of settlementLines) {
    if (!remittancePairs.has(`${sl.settlementAttemptId}:${sl.workerId}`)) {
      continue;
    }
    const worklogId = segmentIdToWorklogId.get(sl.sourceId);
    if (!worklogId) continue;
    addAmount(amountByWorklogId, worklogId, Number(sl.amount));
  }

  return amountByWorklogId;
}

async function computeUnremittedAmounts(
  prisma: PrismaService,
  input: { worklogIds: string[]; periodStart?: Date; periodEnd?: Date },
): Promise<Map<string, number>> {
  const amountByWorklogId = new Map<string, number>();
  const timeSegmentBaseWhere = buildTimeSegmentBaseWhere(input);

  const activeSegments = await prisma.timeSegment.findMany({
    where: { ...timeSegmentBaseWhere, status: 'ACTIVE' },
    select: {
      id: true,
      workLogId: true,
      minutesDuration: true,
      hourlyRateSnapshot: true,
    },
  });

  if (activeSegments.length === 0) return amountByWorklogId;

  const settledSegmentLines = await prisma.settlementLine.findMany({
    where: {
      sourceType: 'TIME_SEGMENT',
      sourceId: { in: activeSegments.map((s) => s.id) },
    },
    select: { sourceId: true },
  });

  const settledSegmentIds = new Set(
    settledSegmentLines.map((sl) => sl.sourceId),
  );

  const unsettledSegments = activeSegments.filter(
    (s) => !settledSegmentIds.has(s.id),
  );

  for (const s of unsettledSegments) {
    const segmentAmount =
      (s.minutesDuration / 60) * Number(s.hourlyRateSnapshot);
    addAmount(amountByWorklogId, s.workLogId, segmentAmount);
  }

  if (unsettledSegments.length === 0) return amountByWorklogId;

  const adjustments = await prisma.adjustment.findMany({
    where: {
      timeSegmentId: { in: unsettledSegments.map((s) => s.id) },
    },
    select: { id: true, timeSegmentId: true, amount: true },
  });

  if (adjustments.length === 0) return amountByWorklogId;

  const settledAdjustmentLines = await prisma.settlementLine.findMany({
    where: {
      sourceType: 'ADJUSTMENT',
      sourceId: { in: adjustments.map((a) => a.id) },
    },
    select: { sourceId: true },
  });

  const settledAdjustmentIds = new Set(
    settledAdjustmentLines.map((sl) => sl.sourceId),
  );

  const timeSegmentIdToWorklogId = new Map<string, string>();
  for (const s of unsettledSegments)
    timeSegmentIdToWorklogId.set(s.id, s.workLogId);

  for (const a of adjustments) {
    if (settledAdjustmentIds.has(a.id)) continue;
    const wlId = a.timeSegmentId
      ? timeSegmentIdToWorklogId.get(a.timeSegmentId)
      : undefined;
    if (!wlId) continue;
    addAmount(amountByWorklogId, wlId, Number(a.amount));
  }

  return amountByWorklogId;
}
