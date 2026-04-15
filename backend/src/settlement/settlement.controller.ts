import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { GenerateRemittancesDto } from './dto/generate-remittances.dto';

@Controller()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post('generate-remittances')
  @HttpCode(HttpStatus.CREATED)
  async generateRemittances(@Body() dto: GenerateRemittancesDto) {
    const data = await this.settlementService.generateRemittances(dto);
    return {
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
