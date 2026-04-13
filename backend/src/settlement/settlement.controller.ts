import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GenerateRemittancesDto } from './dto/generate-remittances.dto';
import { SettlementService } from './settlement.service';

@Controller()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post('generate-remittances')
  async generate(
    @Body() body: GenerateRemittancesDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.settlementService.generateRemittances(
      body.period_start,
      body.period_end,
    );
    res.status(result.remittances.length > 0 ? 201 : 200);
    return result;
  }
}
