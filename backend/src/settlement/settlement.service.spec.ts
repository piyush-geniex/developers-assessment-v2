import { Test, TestingModule } from '@nestjs/testing';
import { SettlementService } from './settlement.service';

describe('SettlementService', () => {
  let service: SettlementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettlementService],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
