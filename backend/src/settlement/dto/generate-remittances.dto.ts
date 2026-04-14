import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Request body for POST /generate-remittances
 * period_start and period_end are ISO date strings (YYYY-MM-DD)
 */
export class GenerateRemittancesDto {
  @IsNotEmpty()
  @IsString()
  period_start: string;

  @IsNotEmpty()
  @IsString()
  period_end: string;
}
