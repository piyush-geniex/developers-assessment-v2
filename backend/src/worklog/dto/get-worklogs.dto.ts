
export class GetWorklogsDto {
  remittance_status: 'REMITTED' | 'UNREMITTED';
  user_id?: string;
  period_start?: string;
  period_end?: string;
}
