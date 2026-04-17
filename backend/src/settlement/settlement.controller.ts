import { Body, Controller, Post } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { GenerateRemittanceDto } from './dto/generate-remittance.dto';

@Controller()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post('generate-remittances')
  async generate(@Body() dto: GenerateRemittanceDto) {
    return await this.settlementService.generateRemittances(dto);
  }
}
