from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database import get_database_session
from src.remittances.schemas import (
    GenerateRemittancesRequest,
    UpdateRemittanceStatusRequest,
)
from src.remittances import service as remittances_service

router = APIRouter(tags=["remittances"])


@router.post("/generate-remittances")
def generate_remittances(
    request_body: GenerateRemittancesRequest,
    database_session: Session = Depends(get_database_session),
) -> dict:
    data = remittances_service.generate_remittances(
        database_session=database_session,
        period_start=request_body.period_start,
        period_end=request_body.period_end,
    )
    return {"data": data}


@router.post("/remittances/{remittance_id}/status")
def update_remittance_status(
    remittance_id: int,
    request_body: UpdateRemittanceStatusRequest,
    database_session: Session = Depends(get_database_session),
) -> dict:
    data = remittances_service.update_remittance_status(
        database_session=database_session,
        remittance_id=remittance_id,
        status=request_body.status,
    )
    return {"data": data}
