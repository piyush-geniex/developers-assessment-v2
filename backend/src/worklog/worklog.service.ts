import { Injectable } from '@nestjs/common';
import {PrismaService} from "../prisma/prisma.service";
import {GetWorklogsDto} from "./dto/get-worklogs.dto";

@Injectable()
export class WorklogService {

    constructor(private prisma: PrismaService) {}

    getWorklogs(query: GetWorklogsDto) {
        const { remittance_status, user_id, period_start, period_end } = query;

        const filters: string[] = [];
        const values: any[] = [];

        if (user_id) {
            values.push(user_id);
            filters.push(`wl.worker_id = $${values.length}`);
        }

        if (period_start) {
            values.push(new Date(period_start));
            filters.push(`ts.start_time >= $${values.length}`);
        }

        if (period_end) {
            values.push(new Date(period_end));
            filters.push(`ts.end_time <= $${values.length}`);
        }

        const whereClause =
            filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        if (remittance_status === 'REMITTED') {
            return this.prisma.$queryRawUnsafe(`
        SELECT wl.id,
               wl.worker_id,
               wl.task_id,
               COALESCE(SUM(sl.amount), 0) as amount
        FROM worklogs wl
               JOIN time_segments ts
                    ON ts.worklog_id = wl.id
               JOIN settlement_lines sl
                    ON sl.source_id = ts.id
                      AND sl.source_type = 'TIME_SEGMENT'
               JOIN remittances r
                    ON r.settlement_run_id = sl.settlement_run_id
                      AND r.status = 'PAID'
          ${whereClause}
        GROUP BY wl.id
      `, ...values);
        }

        return this.prisma.$queryRawUnsafe(`
      SELECT wl.id,
             wl.worker_id,
             wl.task_id,
             COALESCE(SUM(
                        (ts.minutes_duration / 60.0) * ts.hourly_rate_snapshot
                      ), 0)
               +
             COALESCE(SUM(adj.amount), 0) as amount
      FROM worklogs wl
             LEFT JOIN time_segments ts
                       ON ts.worklog_id = wl.id
                         AND ts.status = 'ACTIVE'
                         AND NOT EXISTS (SELECT 1
                                         FROM settlement_lines sl
                                         WHERE sl.source_id = ts.id
                                           AND sl.source_type = 'TIME_SEGMENT')
             LEFT JOIN adjustments adj
                       ON adj.time_segment_id = ts.id
                         AND NOT EXISTS (SELECT 1
                                         FROM settlement_lines sl
                                         WHERE sl.source_id = adj.id
                                           AND sl.source_type = 'ADJUSTMENT')
        ${whereClause}
      GROUP BY wl.id
    `, ...values);
    }
}
