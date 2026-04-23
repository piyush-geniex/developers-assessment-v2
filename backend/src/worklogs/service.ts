import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Record } from './models';
import { WorklogFilterDto, RemittanceStatus } from './schemas';

@Injectable()
export class WorklogService {
  constructor(
    @InjectRepository(Record)
    private readonly repo: Repository<Record>,
  ) {}

  async getWorklogs(filters: WorklogFilterDto) {
    const query = this.repo.createQueryBuilder('worklog')
      .leftJoinAndSelect('worklog.children', 'child') // Récupère segments/adjustments
      .where('worklog.type = :type', { type: 'worklog' });

    // 1. Filtre user_id (dans le JSONB du parent)
    if (filters.user_id) {
      query.andWhere("worklog.payload->>'user_id' = :userId", { userId: filters.user_id });
    }

    if (filters.period_start && filters.period_end) {
        query.andWhere(qb => {
          const subQuery = qb
            .subQuery()
            .select('1')
            .from(Record, 'child')
            .where('child.parentId = worklog.id')
            // Ensure the child dates fall within the range
            .andWhere("(child.payload->>'start')::timestamp >= :start", { start: filters.period_start })
            .andWhere("(child.payload->>'end')::timestamp <= :end", { end: filters.period_end })
            .getQuery();

          return `EXISTS ${subQuery}`;
        });
    }

    // 3. Filtre Remittance Status
    // Note : On vérifie si LE WORKLOG est lié à une remittance 
    // ou si ses enfants le sont, selon votre logique métier.
    // Filtrage basé sur les enfants
  if (filters.remittance_status === RemittanceStatus.REMITTED) {
    // On veut les worklogs dont au moins un enfant a un remittance_id
    query.andWhere(qb => {
      const subQuery = qb.subQuery()
        .select('1')
        .from(Record, 'c')
        .where('c.parentId = worklog.id')
        .andWhere("c.payload->>'remittance_id' IS NOT NULL")
        .getQuery();
      return `EXISTS ${subQuery}`;
    });
  } else if (filters.remittance_status === RemittanceStatus.UNREMITTED) {
    // On veut les worklogs dont AUCUN enfant n'a de remittance_id
    query.andWhere(qb => {
      const subQuery = qb.subQuery()
        .select('1')
        .from(Record, 'c')
        .where('c.parentId = worklog.id')
        .andWhere("c.payload->>'remittance_id' IS NOT NULL")
        .getQuery();
      return `NOT EXISTS ${subQuery}`;
    });
  }

    const worklogs = await query.getMany();

    return worklogs.map(wl => {
        const children = wl.children || [];
        
        // Get the rate from the parent worklog payload
        const hourlyRate = wl.payload?.hourly_rate || 0;

        const childWithRemittance = children.find(child => child.payload?.remittance_id !== undefined);
        const remittanceId = childWithRemittance ? childWithRemittance.payload.remittance_id : null;

        return {
          id: wl.id,
          type: wl.type,
          payload: wl.payload,
          // Pass hourlyRate here ->
          total_amount: this.calculateWorklogTotal(children, hourlyRate),
          remittance_id: remittanceId, 
          is_remitted: remittanceId !== null 
        };
    });
  }

  private calculateWorklogTotal(children: Record[], hourlyRate: number): number {
      return children.reduce((sum, child) => {
        const p = child.payload || {};
        
        if (child.type === 'segment' && p.status === 'approved') {
          // 1. Calculate hours from timestamps
          const start = new Date(p.start).getTime();
          const end = new Date(p.end).getTime();
          const hours = (end - start) / 3600000; // ms to hours

          // 2. Use the rate (ensure we don't multiply by 0)
          const rate = hourlyRate || 0;
          
          return sum + (hours * rate);
        }

        if (child.type === 'adjustment') {
          // Adjustments use 'amount' directly
          return sum + (p.amount || 0);
        }
        
        return sum;
      }, 0);
  }
}