import { Test, TestingModule } from '@nestjs/testing';
import { WorklogController } from './worklog.controller';
import { WorklogService } from './worklog.service';

describe('WorklogController', () => {
  let controller: WorklogController;
  let worklogService: { getWorklogs: jest.Mock };

  beforeEach(async () => {
    worklogService = {
      getWorklogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorklogController],
      providers: [{ provide: WorklogService, useValue: worklogService }],
    }).compile();

    controller = module.get<WorklogController>(WorklogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call WorklogService.getWorklogs', async () => {
    worklogService.getWorklogs.mockResolvedValueOnce([
      {
        id: 'wl_1',
        amount: 123.45,
        worker: { id: 'w_1', email: 'w_1@test.com', name: 'Worker One' },
        task: { id: 't_1', name: 'Task One', description: 'Task One Desc' },
      },
    ]);

    await expect(
      controller.getWorklogs({
        remittance_status: 'UNREMITTED',
      }),
    ).resolves.toEqual([
      {
        id: 'wl_1',
        amount: 123.45,
        worker: { id: 'w_1', email: 'w_1@test.com', name: 'Worker One' },
        task: { id: 't_1', name: 'Task One', description: 'Task One Desc' },
      },
    ]);

    expect(worklogService.getWorklogs).toHaveBeenCalledTimes(1);
  });
});
