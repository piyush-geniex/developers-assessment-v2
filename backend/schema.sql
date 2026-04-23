-- Enum for Record Types
CREATE TYPE record_type AS ENUM ('worklog', 'segment', 'adjustment', 'remittance');

CREATE TABLE records (
    id          SERIAL PRIMARY KEY,
    type        record_type NOT NULL,
    -- Self-referencing Foreign Key
    "parentId"  INTEGER REFERENCES records(id) ON DELETE CASCADE,
    -- Flexible JSONB storage for domain-specific data
    payload     JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for Performance
CREATE INDEX idx_records_type ON records(type);
CREATE INDEX idx_records_parent ON records("parentId");
-- Functional index for settlement date lookups
CREATE INDEX idx_records_payload_start ON records (((payload->>'start')::timestamp));
-- Partial index for unremitted records (Optimization)
CREATE INDEX idx_unremitted_payload ON records (type) 
WHERE (payload->>'remittance_id' IS NULL);