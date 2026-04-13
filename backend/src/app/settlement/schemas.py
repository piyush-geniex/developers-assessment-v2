from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.constants import REMITTANCE_STATUS_SUCCEEDED


class GenerateRemittancesRequest(BaseModel):
    period_start: date
    period_end: date = Field(..., description="Inclusive end date of the settlement period.")
    attempt_status: str = Field(
        default=REMITTANCE_STATUS_SUCCEEDED,
        description="Desired remittance status for this settlement attempt.",
    )
