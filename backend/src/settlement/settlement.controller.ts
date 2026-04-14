import {
  Controller,
  Post,
  Body,
  BadRequestException,
  ConflictException,
  HttpCode,
} from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { GenerateRemittancesDto } from './dto/generate-remittances.dto';
import { GenerateRemittancesResponseDto } from './dto/remittance-response.dto';
import {
  RemittanceAlreadyExistsException,
  InvalidPeriodException,
} from './settlement.exceptions';

@Controller()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  /**
   * POST /settlement/generate-remittances
   * Body: { period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD" }
   *
   * Returns: 201 with GenerateRemittancesResponseDto
   * Returns: 400 if validation fails
   * Returns: 409 if remittance already exists for user+period
   */
  @Post('generate-remittances')
  @HttpCode(201)
  async generateRemittances(
    @Body() body: GenerateRemittancesDto,
  ): Promise<GenerateRemittancesResponseDto> {
    try {
      return await this.settlementService.generateRemittances(
        body.period_start,
        body.period_end,
      );
    } catch (error) {
      if (error instanceof RemittanceAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      if (error instanceof InvalidPeriodException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
