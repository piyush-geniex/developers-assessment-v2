import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const allowedOriginString = config.getOrThrow('BACKEND_CORS_ORIGINS');
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = allowedOriginString.split(',').filter(Boolean);

      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    methods: 'GET,PUT,POST,PATCH,DELETE,UPDATE,OPTIONS',
    credentials: true,
  });

  app.use(
      helmet({
        frameguard: { action: 'deny' },
        noSniff: true,
        hidePoweredBy: true,
        dnsPrefetchControl: { allow: false },
        ieNoOpen: true,
      }),
  );


  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(config.getOrThrow('PORT') ?? 3000);
}
bootstrap();
