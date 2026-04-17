export type RemittanceStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface CreateRemittanceDTO {
  user_id: string;
  amount: number;
  period_start: string;
  period_end: string;
  status?: RemittanceStatus;
}
