import { IsOptional, IsString } from 'class-validator';

/**
 * Query parameters for GET /worklogs
 * - remittance_status: filter by REMITTED or UNREMITTED
 * - user_id: filter by specific user
 * - period_start: filter worklogs created on or after this date
 * - period_end: filter worklogs created on or before this date
 */
export class GetWorklogsDto {
  @IsOptional()
  @IsString()
  remittance_status?: string;

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
