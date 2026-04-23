import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Brackets } from 'typeorm';
import { Record } from '../worklogs/models';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(private dataSource: DataSource) {}

  async generateAllRemittances(period_start: string, period_end: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const results = { succeeded: 0, failed: 0, errors: [] as any[] };



    try {
      /*const payableRecords = await queryRunner.manager.createQueryBuilder(Record, 'record')
        .leftJoinAndSelect('record.parent', 'parent')
        .where('record.type IN (:...types)', { types: ['segment', 'adjustment'] })
        .andWhere(new Brackets(qb => {
            qb.where("record.type = 'adjustment'") // Allow all adjustments
            .orWhere(
                "(record.payload->>'start')::timestamp >= :start AND (record.payload->>'end')::timestamp <= :end", 
                { start: period_start, end: period_end }
            );
        }))
        .getMany();

      

      //console.log(payableRecords);

      const unremitted = payableRecords.filter(
        (r) =>
          !r.payload?.remittance_id &&
          (r.type === 'adjustment' ||
            (r.type === 'segment' && r.payload?.status === 'approved')),
      );*/

      const payableRecords = await queryRunner.manager.createQueryBuilder(Record, 'record')
        .leftJoinAndSelect('record.parent', 'parent')
        // 1. Only fetch records that haven't been remitted yet
        .where("record.payload->>'remittance_id' IS NULL")
        // 2. Limit to relevant types
        .andWhere('record.type IN (:...types)', { types: ['segment', 'adjustment'] })
        // 3. Apply business logic and date filtering
        .andWhere(new Brackets(qb => {
            qb.where("record.type = 'adjustment'")
            .orWhere(
                "(record.payload->>'status' = 'approved' AND (record.payload->>'start')::timestamp >= :start AND (record.payload->>'end')::timestamp <= :end)", 
                { start: period_start, end: period_end }
            );
        }))
        .getMany();

      const recordsByWorker = this.groupByWorker(payableRecords);

      

      for (const [workerId, records] of Object.entries(recordsByWorker)) {
        try {
          
          const totalAmount = this.calculateTotal(records);
          
          if (totalAmount <= 0) continue;

          // 1. Créer la Remittance
          const remittance = queryRunner.manager.create(Record, {
            type: 'remittance',
            payload: {
              user_id: workerId,
              amount: totalAmount,
              period: `${period_start} to ${period_end}`,
              status: 'REMITTED',
              generatedAt: new Date().toISOString(),
            },
          });

          

          const savedRemittance = await queryRunner.manager.save(remittance);

          // 2. Bulk update with named parameters (prevents pg warnings and SQL injection)
          const recordIds = records.map((r) => r.id);

          await queryRunner.manager
            .createQueryBuilder()
            .update(Record)
            .set({
              payload: () => `payload || :patch::jsonb`, // ← paramètre nommé
            })
            .setParameter('patch', JSON.stringify({ remittance_id: savedRemittance.id }))
            .whereInIds(recordIds)
            .execute();

          results.succeeded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown';
          this.logger.error(`Worker ${workerId} failed: ${msg}`);
          results.failed++;
          results.errors.push({ workerId, error: msg });
        }
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return results;
  }

  
  private groupByWorker(records: Record[]): { [key: string]: Record[] } {
    return records.reduce((acc, record) => {
        // Look at the parent's payload if the current record doesn't have it
        const workerId = record.payload?.user_id || record.parent?.payload?.user_id;

        if (!workerId) {
            this.logger.warn(`Record ${record.id} has no user_id and no parent user_id`);
            return acc;
        }

        if (!acc[workerId]) acc[workerId] = [];
        acc[workerId].push(record);
        return acc;
    }, {} as { [key: string]: Record[] });
  }

  private calculateTotal(records: Record[]): number {
    return records.reduce((sum, r) => {
        if (r.type === 'segment') {
        // 1. Calculate duration in hours
        const start = new Date(r.payload.start).getTime();
        const end = new Date(r.payload.end).getTime();
        
        // (ms difference) / (1000ms * 60s * 60m)
        const hours = (end - start) / 3600000;

        // 2. Access the rate from the parent's payload
        // According to your logs, the parent is the 'worklog' record
        const rate = r.parent?.payload?.hourly_rate || 0;

        this.logger.debug(`Processing ${r.payload.segment_id}: ${hours.toFixed(2)}h @ ${rate}/h`);

        return sum + (hours * rate);
        }

        if (r.type === 'adjustment') {
        return sum + (r.payload.amount || 0);
        }

        return sum;
    }, 0);
}
}