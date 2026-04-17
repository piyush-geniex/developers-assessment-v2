import { DataSource } from 'typeorm';
import { RemittanceModel } from '../remittance/models/remittance.model';
import { WorklogModel } from '../worklogs/models/worklog.model';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_SERVER,
  port: Number(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,

  entities: [WorklogModel, RemittanceModel],
  synchronize: true,
});
