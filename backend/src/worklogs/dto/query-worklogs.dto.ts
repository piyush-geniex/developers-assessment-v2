import { IsOptional, IsIn, IsString, IsDateString } from 'class-validator';

export class QueryWorklogsDto {
  @IsOptional()
  @IsIn(['REMITTED', 'UNREMITTED'])
  remittance_status?: 'REMITTED' | 'UNREMITTED';

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsDateString()
  period_start?: string;

  @IsOptional()
  @IsDateString()
  period_end?: string;
}
