from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class GenerateRemittancesRequest(BaseModel):
    period_start: date
    period_end: date = Field(..., description="Inclusive end date of the settlement period.")
