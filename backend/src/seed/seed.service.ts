import { Injectable } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { WorklogModel } from '../worklogs/models/worklog.model';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SeedService {
  private worklogRepo = AppDataSource.getRepository(WorklogModel);

  async seedWorklogs() {
    try {
      // const filePath = path.resolve(__dirname, '../../../seed/worklogs.json');
      // const filePath = path.join(process.cwd(), 'seed/worklogs.json');
      const filePath = path.resolve(process.cwd(), '../seed/worklogs.json',);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Seed file not found: ${filePath}`);
      }

      const rawData = fs.readFileSync(filePath, 'utf-8');
      const worklogs = JSON.parse(rawData) as any[];

      console.log('Clearing existing worklogs...');

      // CLEAN STRATEGY (recommended)
      await this.worklogRepo.delete({});

      console.log('Seeding fresh data...');

      for (const wl of worklogs) {
        await this.worklogRepo.save({
          ...wl,
          remittance_status: 'UNREMITTED',
        });
      }

      console.log(`Seed completed: ${worklogs.length} records`);
    } catch (error) {
      console.error('Seed failed:', error);
    }
  }
}
