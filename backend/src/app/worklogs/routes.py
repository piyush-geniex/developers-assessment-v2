from __future__ import annotations

import uuid
from datetime import date
from enum import Enum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.constants import HEADER_REQUEST_ID, WORKLOG_REMITTANCE_REMITTED, WORKLOG_REMITTANCE_UNREMITTED
from app.database import get_db
from app.envelope import response_envelope
from app.worklogs import service as worklogs_service

router = APIRouter(tags=["worklogs"])


class RemittanceStatusQuery(str, Enum):
    REMITTED = WORKLOG_REMITTANCE_REMITTED
    UNREMITTED = WORKLOG_REMITTANCE_UNREMITTED


def _request_id(request: Request) -> str:
    header = request.headers.get(HEADER_REQUEST_ID)
    if header and header.strip():
        return header.strip()
    return str(uuid.uuid4())


@router.get("/worklogs")
def list_worklogs(
    request: Request,
    db: Session = Depends(get_db),
    remittance_status: Annotated[RemittanceStatusQuery | None, Query()] = None,
    user_id: Annotated[str | None, Query()] = None,
    period_start: Annotated[date | None, Query()] = None,
    period_end: Annotated[date | None, Query()] = None,
) -> dict:
    rid = _request_id(request)
    if (period_start is None) ^ (period_end is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_start and period_end must be provided together",
        )
    if period_start is not None and period_end is not None and period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_end must be on or after period_start",
        )

    status_filter = remittance_status.value if remittance_status is not None else None
    items = worklogs_service.list_worklogs_for_api(
        db,
        remittance_status=status_filter,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )
    return response_envelope({"worklogs": items}, request_id=rid)
