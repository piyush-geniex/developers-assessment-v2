import { IsIn, IsInt, IsOptional, IsDateString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class WorklogQuerySchema {
  @IsOptional()
  @IsIn(['REMITTED', 'UNREMITTED'])
  remittance_status?: 'REMITTED' | 'UNREMITTED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  user_id?: number;

  @ValidateIf((o) => o.period_end != null || o.period_start != null)
  @IsDateString()
  period_start?: string;

  @ValidateIf((o) => o.period_end != null || o.period_start != null)
  @IsDateString()
  period_end?: string;
}
