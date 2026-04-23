import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// On charge le .env depuis la racine du projet
dotenv.config({ 
  path: path.resolve(process.cwd(), 'src/.env') 
});

console.log(path.join(__dirname, '../**/*.models{.ts,.js}'));

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_SERVER,
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,

  entities: [path.join(__dirname, '../**/models{.ts,.js}')],
  migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
  
  synchronize: false, 
  logging: true, // Enable logging to check if TypeORM connects successfully
});