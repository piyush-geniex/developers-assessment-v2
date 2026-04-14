/**
 * Response DTO for worklog details with calculated amount.
 * The amount is calculated at the application layer based on approved segments and adjustments.
 */
export class WorklogResponseDto {
  id: number;
  external_id: string;
  user_id: string;
  user_name: string;
  task_name: string;
  hourly_rate: number;
  amount: number; // Calculated: sum of approved segment hours × hourly_rate + adjustments
  status: string; // REMITTED or UNREMITTED
  remittance_id: number | null;
  created_at: string;
}
