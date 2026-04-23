// src/database/seed.service.ts
import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Record } from '../worklogs/models';
import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Record)
    private readonly recordRepository: Repository<Record>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.recordRepository.count();
    
    // On évite de doubler les données à chaque redémarrage
    if (count > 0) {
      this.logger.log('Database already has data. Skipping seed.');
      return;
    }

    try {
      // Construction du chemin absolu vers ton JSON
      //const jsonPath = path.resolve(process.cwd(), 'src/database/worklogs.json');
      //const jsonPath = path.resolve(__dirname, 'worklogs.json');
      //const baseDir = __dirname.includes('dist') ? 'dist' : 'src';

      //console.log(baseDir);

      //const jsonPath = join(process.cwd(), baseDir, 'database', 'worklogs.json');
      //console.log(jsonPath);
      const jsonPath = path.join(__dirname, 'worklogs.json');

      const fileContent = fs.readFileSync(jsonPath, 'utf8');
      const worklogs = JSON.parse(fileContent);

      this.logger.log(`Starting to seed ${worklogs.length} worklogs...`);

      for (const item of worklogs) {
        // 1. Création du Parent (Le Log de travail global)
        const parentRecord = await this.recordRepository.save({
          type: 'worklog',
          payload: {
            worklog_id: item.worklog_id,
            user_id: item.user_id,
            user_name: item.user_name,
            task_name: item.task_name,
            hourly_rate: item.hourly_rate,
          },
        });

        // 2. Création des Enfants : Segments
        if (item.segments?.length) {
          const segments = item.segments.map(seg => ({
            type: 'segment',
            parentId: parentRecord.id,
            payload: seg,
          }));
          await this.recordRepository.save(segments);
        }

        // 3. Création des Enfants : Adjustments
        if (item.adjustments?.length) {
          const adjustments = item.adjustments.map(adj => ({
            type: 'adjustment',
            parentId: parentRecord.id,
            payload: adj,
          }));
          await this.recordRepository.save(adjustments);
        }
      }

      this.logger.log('✅ Seeding completed successfully.');
    } catch (error) {
      if (error instanceof Error) {
            this.logger.error(`Failed to seed database: ${error.message}`);
      } else {
            this.logger.error('Failed to seed database with an unknown error');
      }
    }
  }
}