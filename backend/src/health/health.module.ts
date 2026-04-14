import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthRoutes } from './health.routes';

@Module({
  imports: [TerminusModule, TypeOrmModule],
  controllers: [HealthRoutes],
})
export class HealthModule {}
