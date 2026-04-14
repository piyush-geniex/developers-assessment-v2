import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Settlement (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());

    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prismaService.remittance.deleteMany({});
    await prismaService.record.deleteMany({});
    await prismaService.worklog.deleteMany({});
  });

  describe('POST /settlement/generate-remittances', () => {
    it('should return 201 when generating remittances with valid period', async () => {
      // Create test data: worklog with approved segment
      const worklog = await prismaService.worklog.create({
        data: {
          external_id: 'wl-test-001',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Test Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      const recordDate = new Date('2025-11-15T10:00:00Z');
      const recordEndDate = new Date('2025-11-15T12:00:00Z');

      await prismaService.record.create({
        data: {
          type: 'segment',
          parent_id: worklog.id,
          payload: { segment_id: 'seg-test' },
          start_time: recordDate,
          end_time: recordEndDate,
          seg_status: 'approved',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_start: '2025-11-01',
          period_end: '2025-11-30',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('request_id');
      expect(response.body.data).toHaveProperty('remittances');
      expect(response.body.data).toHaveProperty('summary');
      expect(Array.isArray(response.body.data.remittances)).toBe(true);
      expect(response.body.data.summary).toHaveProperty('succeeded');
      expect(response.body.data.summary).toHaveProperty('failed');
      expect(response.body.data.summary).toHaveProperty('errors');
    });

    it('should return 400 when period_start is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_end: '2025-11-30',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('should return 400 when period_end is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_start: '2025-11-01',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('should return 400 when period_start is after period_end', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_start: '2025-11-30',
          period_end: '2025-11-01',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('should return 409 when generating remittances for same period twice', async () => {
      // Create test data
      const worklog = await prismaService.worklog.create({
        data: {
          external_id: 'wl-test-002',
          user_id: 'usr-test-dup',
          user_name: 'Test User',
          task_name: 'Test Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      const recordDate = new Date('2025-11-15T10:00:00Z');
      const recordEndDate = new Date('2025-11-15T12:00:00Z');

      await prismaService.record.create({
        data: {
          type: 'segment',
          parent_id: worklog.id,
          payload: { segment_id: 'seg-test' },
          start_time: recordDate,
          end_time: recordEndDate,
          seg_status: 'approved',
        },
      });

      // First request should succeed
      const response1 = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_start: '2025-11-01',
          period_end: '2025-11-30',
        });

      expect(response1.status).toBe(201);

      // Reset worklog status for second attempt (in real scenario would be prevented by constraint)
      // Actually, second attempt should fail with 409 because remittance already exists
      const response2 = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_start: '2025-11-01',
          period_end: '2025-11-30',
        });

      expect(response2.status).toBe(409);
      expect(response2.body).toHaveProperty('data');
      expect(response2.body).toHaveProperty('meta');
    });

    it('should return empty remittances when no approved segments in period', async () => {
      const response = await request(app.getHttpServer())
        .post('/generate-remittances')
        .send({
          period_start: '2025-11-01',
          period_end: '2025-11-30',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.remittances).toEqual([]);
      expect(response.body.data.summary.succeeded).toBe(0);
      expect(response.body.data.summary.failed).toBe(0);
    });
  });
});
