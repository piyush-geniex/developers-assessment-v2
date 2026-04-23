// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getTypeOrmConfig } from './database';
import { WorklogsModule } from './worklogs/worklogs.module';
import { SettlementModule } from './settlement/settlement.module'; // N'oublie pas d'importer ton module de settlement
import configuration from './config'; // ← importe ta config
import * as path from 'path';
import { SeedService } from './database/seed.service'; // Service de seed pour la base de données
import { Record } from './worklogs/models';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
@Module({
  imports: [
    // 1. Initialise la configuration globale
    ConfigModule.forRoot({ 
      isGlobal: true, 
      load: [configuration],
      envFilePath: path.resolve(process.cwd(), 'src/.env'),
    }),
    TypeOrmModule.forFeature([Record]),
    // 2. Initialise la base de données en utilisant le service de config
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getTypeOrmConfig,
    }),
    
    // 3. Vos domaines
    WorklogsModule,
    SettlementModule
  ],
  providers: [SeedService]
})
export class AppModule {}
