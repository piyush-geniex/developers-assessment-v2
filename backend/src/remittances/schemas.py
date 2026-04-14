from datetime import date

from pydantic import BaseModel


class GenerateRemittancesRequest(BaseModel):
    period_start: date
    period_end: date


class UpdateRemittanceStatusRequest(BaseModel):
    status: str
