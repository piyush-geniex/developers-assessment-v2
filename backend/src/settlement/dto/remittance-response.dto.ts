/**
 * Response DTO for a single remittance record
 */
export class RemittanceDto {
  id: number;
  user_id: string;
  period_start: string; // ISO date string
  period_end: string; // ISO date string
  amount: number;
  status: string;
  worklog_ids: number[];
  created_at: string;
}

/**
 * Response DTO for generate-remittances endpoint
 */
export class GenerateRemittancesResponseDto {
  remittances: RemittanceDto[];
  summary: {
    succeeded: number;
    failed: number;
    errors: Array<{
      user_id: string;
      reason: string;
    }>;
  };
}
