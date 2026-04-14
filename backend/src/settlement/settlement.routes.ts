import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { GenerateRemittancesSchema } from './schemas/generate-remittances.schema';

@Controller()
export class SettlementRoutes {
  constructor(private readonly settlementService: SettlementService) {}

  @Post('generate-remittances')
  async generateRemittances(@Body() body: GenerateRemittancesSchema) {
    const start = body.period_start.slice(0, 10);
    const end = body.period_end.slice(0, 10);
    if (start > end) {
      throw new BadRequestException('period_start must be on or before period_end');
    }
    const { generated, errors } = await this.settlementService.generateRemittances(
      start,
      end,
    );
    return {
      success: true,
      generated: generated.map((g) => ({
        user_id: g.user_id,
        remittance_id: g.remittance_id,
        total_amount: g.total_amount,
      })),
      errors,
    };
  }
}
