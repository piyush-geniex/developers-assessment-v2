import { Test, TestingModule } from '@nestjs/testing';
import { SettlementService } from './settlement.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettlementService', () => {
  let service: SettlementService;
  let prisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject invalid period format', async () => {
    await expect(
      service.generateRemittances({
        period_start: 'not-a-date',
        period_end: 'also-not-a-date',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { message: 'Invalid period format' },
    });
  });

  it('should reject invalid period range', async () => {
    await expect(
      service.generateRemittances({
        period_start: '2025-11-30',
        period_end: '2025-11-01',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { message: 'Invalid period range' },
    });
  });

  it('should reject duplicate settlement period with 409', async () => {
    const txMock = {
      settlementAttempt: {
        findUnique: jest.fn().mockResolvedValue({ id: 'attempt_existing' }),
      },
    };

    prisma.$transaction.mockImplementationOnce(async (fn: any) => fn(txMock));

    await expect(
      service.generateRemittances({
        period_start: '2025-11-01',
        period_end: '2025-11-30',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { message: 'Settlement already exists for this period' },
    });
  });
});
