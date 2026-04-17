import { Injectable } from '@nestjs/common';
import { AppDataSource } from '../../database/data-source';
import { RemittanceModel } from '../models/remittance.model';
import { CreateRemittanceDTO } from '../schemas/remittance.types';

@Injectable()
export class RemittanceService {
  private repo = AppDataSource.getRepository(RemittanceModel);

  async create(data: CreateRemittanceDTO) {
    try {
      const remittance = this.repo.create({
        ...data,
        status: data.status ?? 'PENDING',
      });

      return await this.repo.save(remittance);
    } catch (error) {
      console.error('Failed to create remittance', error);
      throw new Error('Remittance creation failed');
    }
  }

  async findAll() {
    try {
      return await this.repo.find();
    } catch {
      throw new Error('Failed to fetch remittances');
    }
  }
}
