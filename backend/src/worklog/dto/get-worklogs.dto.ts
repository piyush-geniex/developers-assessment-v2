import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class GetWorklogsDto {
  @IsIn(['REMITTED', 'UNREMITTED'])
  remittance_status: 'REMITTED' | 'UNREMITTED';

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsISO8601()
  period_start?: string;

  @IsOptional()
  @IsISO8601()
  period_end?: string;
}
