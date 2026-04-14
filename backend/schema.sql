-- Reference DDL (applied via TypeORM migration InitialSchema1704067200000)
-- See src/migrations/1704067200000-InitialSchema.ts for authoritative version.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE worklog (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT chk_worklog_status CHECK (status IN ('ACTIVE', 'CLOSED'))
);
CREATE INDEX idx_worklog_user ON worklog(user_id);

CREATE TABLE work_log_segment (
  id SERIAL PRIMARY KEY,
  worklog_id INT NOT NULL REFERENCES worklog(id) ON DELETE CASCADE,
  duration_minutes INT NOT NULL,
  rate NUMERIC(19,4),
  amount NUMERIC(19,4),
  earned_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_segment_rate_xor_amount CHECK (
    (rate IS NOT NULL AND amount IS NULL) OR (rate IS NULL AND amount IS NOT NULL)
  ),
  CONSTRAINT chk_segment_duration CHECK (duration_minutes > 0)
);
CREATE INDEX idx_segment_worklog ON work_log_segment(worklog_id);
CREATE INDEX idx_segment_earned ON work_log_segment(earned_at);

CREATE TABLE adjustment (
  id SERIAL PRIMARY KEY,
  worklog_id INT NOT NULL REFERENCES worklog(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL,
  amount_delta NUMERIC(19,4) NOT NULL,
  reason VARCHAR(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applies_to_segment_id INT REFERENCES work_log_segment(id) ON DELETE SET NULL,
  CONSTRAINT chk_adjustment_type CHECK (type IN ('ADD', 'DEDUCT', 'MODIFY'))
);
CREATE INDEX idx_adjustment_worklog ON adjustment(worklog_id);
CREATE INDEX idx_adjustment_created ON adjustment(created_at);

CREATE TABLE remittance (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC(19,4) NOT NULL,
  status VARCHAR(16) NOT NULL,
  error_message VARCHAR(2048),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_remittance_user_period UNIQUE (user_id, period_start, period_end),
  CONSTRAINT chk_remittance_status CHECK (status IN ('SUCCESS', 'FAILED', 'CANCELLED'))
);
CREATE INDEX idx_remittance_user ON remittance(user_id);

CREATE TABLE remittance_item (
  id SERIAL PRIMARY KEY,
  remittance_id INT NOT NULL REFERENCES remittance(id) ON DELETE CASCADE,
  worklog_id INT NOT NULL REFERENCES worklog(id) ON DELETE CASCADE,
  computed_amount NUMERIC(19,4) NOT NULL,
  adjustment_applied_amount NUMERIC(19,4) NOT NULL,
  delta_paid NUMERIC(19,4) NOT NULL
);
CREATE INDEX idx_remittance_item_worklog ON remittance_item(worklog_id);
