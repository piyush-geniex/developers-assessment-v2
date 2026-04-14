import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const shouldRun = process.env.SKIP_E2E !== '1' && process.env.POSTGRES_HOST !== undefined;

(shouldRun ? describe : describe.skip)('App (e2e)', () => {
  let app: INestApplication;

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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  it('POST /generate-remittances validates body', () => {
    return request(app.getHttpServer())
      .post('/generate-remittances')
      .send({})
      .expect(400);
  });

  it('GET /worklogs returns array', async () => {
    const res = await request(app.getHttpServer()).get('/worklogs').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
