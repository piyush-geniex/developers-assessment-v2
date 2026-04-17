import { Controller, Get } from '@nestjs/common';
import { RemittanceService } from '../service/remittance.service';

@Controller('remittances')
export class RemittanceRoutes {
  constructor(private readonly service: RemittanceService) {}

  @Get()
  async getAll() {
    try {
      const data = await this.service.findAll();

      return {
        data,
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch {
      return {
        data: null,
        meta: {
          timestamp: new Date().toISOString(),
          error: 'Failed to fetch remittances',
        },
      };
    }
  }
}
