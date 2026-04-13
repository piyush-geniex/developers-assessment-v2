import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListWorklogsQueryDto {
  @IsOptional()
  @IsIn(['REMITTED', 'UNREMITTED'])
  remittance_status?: 'REMITTED' | 'UNREMITTED';

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  period_start?: string;

  @IsOptional()
  @IsString()
  period_end?: string;
}
