from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.database import get_database_session
from src.worklogs import service as worklogs_service

router = APIRouter(prefix="/worklogs", tags=["worklogs"])


@router.post("/seed")
def seed_worklogs(database_session: Session = Depends(get_database_session)) -> dict:
    data = worklogs_service.seed_worklogs(database_session=database_session)
    return {"data": data}


@router.get("")
def get_worklogs(
    remittance_status: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
    database_session: Session = Depends(get_database_session),
) -> dict:
    normalized_status = remittance_status.upper() if remittance_status else None
    data = worklogs_service.list_worklogs(
        database_session=database_session,
        remittance_status=normalized_status,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )
    return {"data": data}
