import { Test, TestingModule } from '@nestjs/testing';
import { WorklogService } from './worklog.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WorklogService', () => {
  let service: WorklogService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      workLog: { findMany: jest.fn() },
      timeSegment: { findMany: jest.fn() },
      settlementLine: { findMany: jest.fn() },
      adjustment: { findMany: jest.fn() },
      remittance: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WorklogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WorklogService>(WorklogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return worker/task objects and compute UNREMITTED amount', async () => {
    prisma.workLog.findMany.mockResolvedValueOnce([
      {
        id: 'wl_1',
        workerId: 'w_1',
        taskId: 't_1',
        worker: { email: 'w1@test.com', name: 'Worker 1' },
        task: { name: 'Task 1', description: 'Desc 1' },
      },
    ]);

    prisma.timeSegment.findMany.mockResolvedValueOnce([
      {
        id: 'ts_1',
        workLogId: 'wl_1',
        minutesDuration: 60,
        hourlyRateSnapshot: '10.00',
      },
    ]);

    // No settlement lines: segment is unsettled.
    prisma.settlementLine.findMany.mockResolvedValueOnce([]);

    // No adjustments.
    prisma.adjustment.findMany.mockResolvedValueOnce([]);

    const result = await service.getWorklogs({
      remittance_status: 'UNREMITTED',
    });

    expect(result).toEqual([
      {
        id: 'wl_1',
        amount: 10,
        worker: { id: 'w_1', email: 'w1@test.com', name: 'Worker 1' },
        task: { id: 't_1', name: 'Task 1', description: 'Desc 1' },
      },
    ]);

    expect(prisma.settlementLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: 'TIME_SEGMENT',
        }),
      }),
    );
  });

  it('should return only REMITTED worklogs when remittance exists for the settlement attempt', async () => {
    prisma.workLog.findMany.mockResolvedValueOnce([
      {
        id: 'wl_1',
        workerId: 'w_1',
        taskId: 't_1',
        worker: { email: 'w1@test.com', name: 'Worker 1' },
        task: { name: 'Task 1', description: 'Desc 1' },
      },
      {
        id: 'wl_2',
        workerId: 'w_2',
        taskId: 't_2',
        worker: { email: 'w2@test.com', name: 'Worker 2' },
        task: { name: 'Task 2', description: 'Desc 2' },
      },
    ]);

    prisma.timeSegment.findMany.mockResolvedValueOnce([
      { id: 'ts_1', workLogId: 'wl_1' },
      { id: 'ts_2', workLogId: 'wl_2' },
    ]);

    prisma.settlementLine.findMany.mockResolvedValueOnce([
      {
        sourceId: 'ts_1',
        settlementAttemptId: 'attempt_1',
        workerId: 'w_1',
        amount: '12.50',
      },
      {
        sourceId: 'ts_2',
        settlementAttemptId: 'attempt_2',
        workerId: 'w_2',
        amount: '99.00',
      },
    ]);

    prisma.remittance.findMany.mockResolvedValueOnce([
      { settlementAttemptId: 'attempt_1', workerId: 'w_1' },
    ]);

    const result = await service.getWorklogs({
      remittance_status: 'REMITTED',
    });

    expect(result).toEqual([
      {
        id: 'wl_1',
        amount: 12.5,
        worker: { id: 'w_1', email: 'w1@test.com', name: 'Worker 1' },
        task: { id: 't_1', name: 'Task 1', description: 'Desc 1' },
      },
    ]);
  });
});
