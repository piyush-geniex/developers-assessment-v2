import { IsDateString, IsNotEmpty } from 'class-validator';

export class GenerateRemittancesSchema {
  @IsNotEmpty()
  @IsDateString()
  period_start!: string;

  @IsNotEmpty()
  @IsDateString()
  period_end!: string;
}
