import { Test, TestingModule } from '@nestjs/testing';
import { WorklogService } from './worklog.service';

describe('WorklogService', () => {
  let service: WorklogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorklogService],
    }).compile();

    service = module.get<WorklogService>(WorklogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
