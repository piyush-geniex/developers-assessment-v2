-- WorkLog Settlement System — schema

CREATE TABLE IF NOT EXISTS worklog (
    id              SERIAL PRIMARY KEY,
    worklog_id      VARCHAR(50)   NOT NULL UNIQUE,
    user_id         VARCHAR(50)   NOT NULL,
    user_name       VARCHAR(255)  NOT NULL,
    task_name       VARCHAR(255)  NOT NULL,
    hourly_rate     NUMERIC(10,2) NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worklog_user_id ON worklog (user_id);

CREATE TABLE IF NOT EXISTS time_segment (
    id              SERIAL PRIMARY KEY,
    segment_id      VARCHAR(50)   NOT NULL UNIQUE,
    worklog_id      VARCHAR(50)   NOT NULL REFERENCES worklog(worklog_id),
    start_time      TIMESTAMPTZ   NOT NULL,
    end_time        TIMESTAMPTZ   NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'approved',
    dispute_reason  TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_segment_status CHECK (status IN ('approved', 'disputed', 'cancelled'))
);

CREATE INDEX idx_segment_worklog_id ON time_segment (worklog_id);
CREATE INDEX idx_segment_start_time ON time_segment (start_time);

CREATE TABLE IF NOT EXISTS adjustment (
    id              SERIAL PRIMARY KEY,
    adjustment_id   VARCHAR(50)   NOT NULL UNIQUE,
    worklog_id      VARCHAR(50)   NOT NULL REFERENCES worklog(worklog_id),
    amount          NUMERIC(10,2) NOT NULL,
    reason          TEXT          NOT NULL,
    applied_at      TIMESTAMPTZ   NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adjustment_worklog_id ON adjustment (worklog_id);
CREATE INDEX idx_adjustment_applied_at ON adjustment (applied_at);

CREATE TABLE IF NOT EXISTS remittance (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(50)   NOT NULL,
    period_start    DATE          NOT NULL,
    period_end      DATE          NOT NULL,
    gross_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    adjustment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_remittance_status CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    CONSTRAINT uq_remittance_user_period UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX idx_remittance_user_id ON remittance (user_id);
CREATE INDEX idx_remittance_period ON remittance (period_start, period_end);

CREATE TABLE IF NOT EXISTS remittance_line (
    id              SERIAL PRIMARY KEY,
    remittance_id   INT           NOT NULL REFERENCES remittance(id),
    worklog_id      VARCHAR(50)   NOT NULL REFERENCES worklog(worklog_id),
    segment_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    adjustment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total      NUMERIC(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT uq_remittance_worklog UNIQUE (remittance_id, worklog_id)
);

CREATE INDEX idx_remittance_line_remittance ON remittance_line (remittance_id);
CREATE INDEX idx_remittance_line_worklog ON remittance_line (worklog_id);
