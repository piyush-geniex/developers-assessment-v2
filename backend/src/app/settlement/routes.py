from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.constants import HEADER_REQUEST_ID, REMITTANCE_STATUSES_ALLOWED
from app.database import get_db
from app.envelope import response_envelope
from app.settlement.schemas import GenerateRemittancesRequest
from app.settlement.service import generate_remittances_for_period
from app.settlement.validation import validate_settlement_period

router = APIRouter(tags=["settlement"])


def _request_id(request: Request) -> str:
    header = request.headers.get(HEADER_REQUEST_ID)
    if header and header.strip():
        return header.strip()
    return str(uuid.uuid4())


@router.post("/generate-remittances")
def generate_remittances(
    body: GenerateRemittancesRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    rid = _request_id(request)
    try:
        validate_settlement_period(body.period_start, body.period_end)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if body.attempt_status not in REMITTANCE_STATUSES_ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="attempt_status must be one of: PENDING, SUCCEEDED, FAILED, CANCELLED",
        )

    remittances, summary = generate_remittances_for_period(
        db,
        body.period_start,
        body.period_end,
        attempt_status=body.attempt_status,
    )
    payload = {
        "remittances": remittances,
        "summary": summary,
    }
    if summary["remittances_created"] > 0:
        response.status_code = status.HTTP_201_CREATED
    else:
        response.status_code = status.HTTP_200_OK
    return response_envelope(payload, request_id=rid)
