import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Worklog (e2e)', () => {
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

  describe('GET /worklogs', () => {
    it('should return 200 with correct envelope shape', async () => {
      // Create test worklog
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

      const response = await request(app.getHttpServer()).get('/worklogs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
      expect(response.body.meta).toHaveProperty('request_id');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return worklogs with calculated amount field', async () => {
      // Create test worklog with segment
      const worklog = await prismaService.worklog.create({
        data: {
          external_id: 'wl-test-002',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Test Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      const startTime = new Date('2025-11-15T10:00:00Z');
      const endTime = new Date('2025-11-15T12:00:00Z'); // 2 hours = 200

      await prismaService.record.create({
        data: {
          type: 'segment',
          parent_id: worklog.id,
          payload: { segment_id: 'seg-test' },
          start_time: startTime,
          end_time: endTime,
          seg_status: 'approved',
        },
      });

      const response = await request(app.getHttpServer()).get('/worklogs');

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('amount');
      expect(response.body.data[0].amount).toBe(200);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('external_id');
      expect(response.body.data[0]).toHaveProperty('user_id');
      expect(response.body.data[0]).toHaveProperty('status');
    });

    it('should filter by remittance_status=UNREMITTED', async () => {
      // Create unremitted worklog
      const wl1 = await prismaService.worklog.create({
        data: {
          external_id: 'wl-unremitted',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task 1',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      // Create remitted worklog
      const wl2 = await prismaService.worklog.create({
        data: {
          external_id: 'wl-remitted',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task 2',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'REMITTED',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/worklogs')
        .query({ remittance_status: 'UNREMITTED' });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].external_id).toBe('wl-unremitted');
      expect(response.body.data[0].status).toBe('UNREMITTED');
    });

    it('should filter by remittance_status=REMITTED', async () => {
      // Create remitted worklog
      const wl = await prismaService.worklog.create({
        data: {
          external_id: 'wl-remitted',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task 1',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'REMITTED',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/worklogs')
        .query({ remittance_status: 'REMITTED' });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('REMITTED');
    });

    it('should return 400 when remittance_status is invalid', async () => {
      const response = await request(app.getHttpServer())
        .get('/worklogs')
        .query({ remittance_status: 'INVALID' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });

    it('should filter by user_id', async () => {
      // Create worklogs for different users
      const wl1 = await prismaService.worklog.create({
        data: {
          external_id: 'wl-usr-a',
          user_id: 'usr-a',
          user_name: 'User A',
          task_name: 'Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      const wl2 = await prismaService.worklog.create({
        data: {
          external_id: 'wl-usr-b',
          user_id: 'usr-b',
          user_name: 'User B',
          task_name: 'Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/worklogs')
        .query({ user_id: 'usr-a' });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].user_id).toBe('usr-a');
    });

    it('should filter by period_start and period_end', async () => {
      // Create worklog from October
      const wl1 = await prismaService.worklog.create({
        data: {
          external_id: 'wl-oct',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
          created_at: new Date('2025-10-15T10:00:00Z'),
        },
      });

      // Create worklog from November
      const wl2 = await prismaService.worklog.create({
        data: {
          external_id: 'wl-nov',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
          created_at: new Date('2025-11-15T10:00:00Z'),
        },
      });

      const response = await request(app.getHttpServer())
        .get('/worklogs')
        .query({
          period_start: '2025-11-01',
          period_end: '2025-11-30',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].external_id).toBe('wl-nov');
    });

    it('should include adjustment amounts in calculation', async () => {
      const worklog = await prismaService.worklog.create({
        data: {
          external_id: 'wl-with-adj',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      // Add segment: 2 hours × 100 = 200
      await prismaService.record.create({
        data: {
          type: 'segment',
          parent_id: worklog.id,
          payload: { segment_id: 'seg-test' },
          start_time: new Date('2025-11-15T10:00:00Z'),
          end_time: new Date('2025-11-15T12:00:00Z'),
          seg_status: 'approved',
        },
      });

      // Add adjustment: -50
      await prismaService.record.create({
        data: {
          type: 'adjustment',
          parent_id: worklog.id,
          payload: { adjustment_id: 'adj-test', amount: -50 },
        },
      });

      const response = await request(app.getHttpServer()).get('/worklogs');

      expect(response.status).toBe(200);
      expect(response.body.data[0].amount).toBe(150); // 200 - 50
    });

    it('should only sum approved segments, not disputed or cancelled', async () => {
      const worklog = await prismaService.worklog.create({
        data: {
          external_id: 'wl-mixed-segments',
          user_id: 'usr-test',
          user_name: 'Test User',
          task_name: 'Task',
          hourly_rate: new (require('@prisma/client').Prisma.Decimal)(
            100,
          ),
          status: 'UNREMITTED',
        },
      });

      // Add approved segment: 2 hours × 100 = 200
      await prismaService.record.create({
        data: {
          type: 'segment',
          parent_id: worklog.id,
          payload: { segment_id: 'seg-approved' },
          start_time: new Date('2025-11-15T10:00:00Z'),
          end_time: new Date('2025-11-15T12:00:00Z'),
          seg_status: 'approved',
        },
      });

      // Add disputed segment: 1 hour × 100 = 100 (should not be counted)
      await prismaService.record.create({
        data: {
          type: 'segment',
          parent_id: worklog.id,
          payload: { segment_id: 'seg-disputed' },
          start_time: new Date('2025-11-16T10:00:00Z'),
          end_time: new Date('2025-11-16T11:00:00Z'),
          seg_status: 'disputed',
        },
      });

      const response = await request(app.getHttpServer()).get('/worklogs');

      expect(response.status).toBe(200);
      expect(response.body.data[0].amount).toBe(200); // Only approved segments
    });
  });
});
