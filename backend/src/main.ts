import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppDataSource } from './database/data-source';

async function bootstrap() {
  try {
    await AppDataSource.initialize();

    const app = await NestFactory.create(AppModule);

    await app.listen(3000, '0.0.0.0');
  } catch (error) {
    console.error('Bootstrap error:', error);
  }
}

bootstrap();
