import { Controller, Post, Body } from '@nestjs/common';
import { SettlementService } from '../service/settlement.service';

export class GenerateRemittancesDto {
  period_start: string = '';
  period_end: string = '';
}

@Controller('generate-remittances')
export class SettlementRoutes {
  constructor(private readonly service: SettlementService) {}

  @Post()
  async generate(@Body() body: GenerateRemittancesDto) {
    const result = await this.service.generateRemittances(
      body.period_start,
      body.period_end,
    );

    return {
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}
