export interface SegmentRecord {
  segment_id: string;
  start: string;
  end: string;
  status: string;
  dispute_reason?: string;
}

export interface AdjustmentRecord {
  adjustment_id: string;
  amount: number;
  reason: string;
  applied_at: string;
}
