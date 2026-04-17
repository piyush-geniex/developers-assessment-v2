import { Test, TestingModule } from '@nestjs/testing';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

describe('SettlementController', () => {
  let controller: SettlementController;
  let settlementService: { generateRemittances: jest.Mock };

  beforeEach(async () => {
    settlementService = {
      generateRemittances: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettlementController],
      providers: [{ provide: SettlementService, useValue: settlementService }],
    }).compile();

    controller = module.get<SettlementController>(SettlementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call SettlementService.generateRemittances', async () => {
    settlementService.generateRemittances.mockResolvedValueOnce({
      settlementAttemptId: 'attempt_1',
      workersPaid: 0,
    });

    await expect(
      controller.generate({
        period_start: '2025-11-01',
        period_end: '2025-11-30',
      }),
    ).resolves.toEqual({ settlementAttemptId: 'attempt_1', workersPaid: 0 });

    expect(settlementService.generateRemittances).toHaveBeenCalledTimes(1);
  });
});
