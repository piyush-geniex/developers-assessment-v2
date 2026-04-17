import { IsISO8601, IsNotEmpty } from 'class-validator';

export class GenerateRemittanceDto {
  @IsNotEmpty()
  @IsISO8601()
  period_start: string; // ISO date

  @IsNotEmpty()
  @IsISO8601()
  period_end: string;
}
