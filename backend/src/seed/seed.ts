import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { AppDataSource } from '../database/data-source';
import { SeedService } from './seed.service';

async function bootstrap() {
  try {
    console.log('DB CONFIG:', {
      host: process.env.POSTGRES_SERVER,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    });

    await AppDataSource.initialize();

    const seedService = new SeedService();
    await seedService.seedWorklogs();

    await AppDataSource.destroy();

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seed error:', error);
  }
}

void bootstrap();