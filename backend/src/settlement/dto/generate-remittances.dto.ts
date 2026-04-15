import { IsDateString } from 'class-validator';

export class GenerateRemittancesDto {
  @IsDateString()
  period_start: string;

  @IsDateString()
  period_end: string;
}

export interface UserSettlementResult {
  user_id: string;
  user_name: string;
  amount: number;
  worklog_count: number;
  status: 'SETTLED' | 'FAILED';
  error?: string;
}
