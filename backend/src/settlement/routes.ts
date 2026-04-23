import { Controller, Post, Body, UseInterceptors } from '@nestjs/common';
import { SettlementService } from './service';
import { GenerateRemittanceDto } from './schemas';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';

@UseInterceptors(TransformInterceptor) // <--- Add this specifically here
@Controller()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}
  @Post('generate-remittances')
  async generateRemittances(@Body() dto: GenerateRemittanceDto) {
    return await this.settlementService.generateAllRemittances(
      dto.period_start,
      dto.period_end,
    );
  }
}