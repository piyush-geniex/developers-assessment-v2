import { DataSource } from 'typeorm';
import { Adjustment } from '../worklog/models/adjustment.entity';
import { WorkLogSegment } from '../worklog/models/work-log-segment.entity';
import { Worklog } from '../worklog/models/worklog.entity';
import { RemittanceItem } from '../settlement/models/remittance-item.entity';
import { Remittance } from '../settlement/models/remittance.entity';
import { User } from '../user/models/user.entity';
import { InitialSchema1704067200000 } from '../migrations/1704067200000-InitialSchema';

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  username: process.env.POSTGRES_USER ?? 'appuser',
  password: process.env.POSTGRES_PASSWORD ?? 'apppass',
  database: process.env.POSTGRES_DB ?? 'assessment',
  entities: [User, Worklog, WorkLogSegment, Adjustment, Remittance, RemittanceItem],
  migrations: [InitialSchema1704067200000],
});
