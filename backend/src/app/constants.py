"""Domain and API string constants (avoid magic strings in services and routes)."""

# Time segment lifecycle (seed + business rules)
SEGMENT_STATUS_APPROVED = "approved"
SEGMENT_STATUS_DISPUTED = "disputed"
SEGMENT_STATUS_CANCELLED = "cancelled"

SEGMENT_STATUSES_PAYABLE = frozenset({SEGMENT_STATUS_APPROVED})

# Worklog aggregate remittance filter (API query + response)
WORKLOG_REMITTANCE_REMITTED = "REMITTED"
WORKLOG_REMITTANCE_UNREMITTED = "UNREMITTED"

# Remittance payout lifecycle
REMITTANCE_STATUS_PENDING = "PENDING"
REMITTANCE_STATUS_SUCCEEDED = "SUCCEEDED"
REMITTANCE_STATUS_FAILED = "FAILED"
REMITTANCE_STATUS_CANCELLED = "CANCELLED"

REMITTANCE_STATUSES_TERMINAL_SUCCESS = frozenset({REMITTANCE_STATUS_SUCCEEDED})

# Allocation discriminator (stored for auditability)
ALLOCATION_TYPE_SEGMENT = "segment"
ALLOCATION_TYPE_ADJUSTMENT = "adjustment"

# HTTP / API
HEADER_REQUEST_ID = "X-Request-ID"
ENV_DATABASE_URL = "DATABASE_URL"
ENV_SEED_JSON_PATH = "SEED_JSON_PATH"

# Pool sizing (see backend/AGENTS.md)
DB_POOL_SIZE = 10
DB_MAX_OVERFLOW = 10
