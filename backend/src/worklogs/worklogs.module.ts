import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Record } from './models';        // Ton entité TypeORM
import { WorklogService } from './service'; // Ton service de calcul
import { WorklogRoutes } from './routes';   // Ton controller

@Module({
  imports: [
    // Indispensable pour injecter le Repository dans ton service
    TypeOrmModule.forFeature([Record])
  ],
  controllers: [WorklogRoutes],
  providers: [WorklogService],
  exports: [WorklogService], // Permet à d'autres modules (ex: Settlement) de l'utiliser
})
export class WorklogsModule {}