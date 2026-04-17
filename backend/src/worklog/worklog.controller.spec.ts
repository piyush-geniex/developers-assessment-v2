import { Test, TestingModule } from '@nestjs/testing';
import { WorklogController } from './worklog.controller';

describe('WorklogController', () => {
  let controller: WorklogController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorklogController],
    }).compile();

    controller = module.get<WorklogController>(WorklogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
