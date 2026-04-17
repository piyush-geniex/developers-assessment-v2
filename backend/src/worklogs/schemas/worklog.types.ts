export type Segment = {
  segment_id: string;
  start: string;
  end: string;
  status: 'approved' | 'disputed' | 'cancelled';
};

export type Adjustment = {
  adjustment_id: string;
  amount: number;
  reason: string;
  applied_at: string;
};
