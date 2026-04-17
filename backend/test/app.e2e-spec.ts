import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ValidationPipe } from '@nestjs/common';
import { SettlementController } from '../src/settlement/settlement.controller';
import { SettlementService } from '../src/settlement/settlement.service';
import { WorklogController } from '../src/worklog/worklog.controller';
import { WorklogService } from '../src/worklog/worklog.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { ResponseEnvelopeInterceptor } from '../src/common/response-envelope.interceptor';
import { EnvelopeExceptionFilter } from '../src/common/envelope-exception.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  const makeApp = async (prismaMock: Partial<PrismaService>) => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SettlementController, WorklogController],
      providers: [
        SettlementService,
        WorklogService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    const nestApp = moduleFixture.createNestApplication();
    nestApp.use(requestIdMiddleware);
    nestApp.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    nestApp.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    nestApp.useGlobalFilters(new EnvelopeExceptionFilter());
    await nestApp.init();
    return nestApp;
  };

  it('POST /generate-remittances returns 400 for invalid period range', async () => {
    app = await makeApp({
      $transaction: jest.fn(),
    } as any);

    await request(app.getHttpServer())
      .post('/generate-remittances')
      .send({ period_start: '2025-11-30', period_end: '2025-11-01' })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          data: {
            statusCode: 400,
            message: 'Invalid period range',
            error: 'Bad Request',
          },
          meta: {
            timestamp: expect.any(String),
            request_id: expect.any(String),
          },
        });
      });
  });

  it('POST /generate-remittances returns 201 with a stable response shape', async () => {
    const txMock = {
      settlementAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'attempt_1',
          periodStart: new Date(),
          periodEnd: new Date(),
          status: 'PENDING',
        }),
        update: jest.fn().mockResolvedValue({ id: 'attempt_1' }),
      },
      timeSegment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      adjustment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      settlementLine: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      remittance: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    app = await makeApp({
      $transaction: jest.fn(async (fn: any) => fn(txMock)),
    } as any);

    await request(app.getHttpServer())
      .post('/generate-remittances')
      .send({ period_start: '2025-11-01', period_end: '2025-11-30' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          data: {
            settlementAttemptId: 'attempt_1',
            workersPaid: 0,
          },
          meta: {
            timestamp: expect.any(String),
            request_id: expect.any(String),
          },
        });
      });
  });

  it('GET /worklogs returns 400 for invalid remittance_status', async () => {
    app = await makeApp({} as any);

    await request(app.getHttpServer())
      .get('/worklogs?remittance_status=NOPE')
      .expect(400)
      .expect(({ body }) => {
        expect(body.data.statusCode).toBe(400);
        expect(body.data.message).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              'remittance_status must be one of the following values',
            ),
          ]),
        );
        expect(body.meta).toEqual({
          timestamp: expect.any(String),
          request_id: expect.any(String),
        });
      });
  });

  it('GET /worklogs returns 200 and includes amount per worklog', async () => {
    app = await makeApp({
      workLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wl_1',
            workerId: 'w_1',
            taskId: 't_1',
            worker: { email: 'w_1@test.com', name: 'Worker One' },
            task: { name: 'Task One', description: 'Task One Desc' },
          },
        ]),
      },
      timeSegment: {
        findMany: jest.fn().mockResolvedValueOnce([
          {
            id: 'ts_1',
            workLogId: 'wl_1',
            minutesDuration: 60,
            hourlyRateSnapshot: '42.50',
          },
        ]),
      },
      settlementLine: { findMany: jest.fn().mockResolvedValue([]) },
      adjustment: { findMany: jest.fn().mockResolvedValue([]) },
    } as any);

    await request(app.getHttpServer())
      .get('/worklogs?remittance_status=UNREMITTED')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          data: [
            expect.objectContaining({
              id: 'wl_1',
              amount: 42.5,
              worker: { id: 'w_1', email: 'w_1@test.com', name: 'Worker One' },
              task: {
                id: 't_1',
                name: 'Task One',
                description: 'Task One Desc',
              },
            }),
          ],
          meta: {
            timestamp: expect.any(String),
            request_id: expect.any(String),
          },
        });
      });
  });
});
