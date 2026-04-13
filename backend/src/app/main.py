from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.database import Base, get_engine, get_session_factory
from app.seed import load_seed_json
from app.settlement.routes import router as settlement_router
from app.worklogs.routes import router as worklogs_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _import_models_for_metadata() -> None:
    from app.settlement import models as _settlement_models  # noqa: F401
    from app.worklogs import models as _worklog_models  # noqa: F401


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _import_models_for_metadata()
    Base.metadata.create_all(bind=get_engine())
    settings = get_settings()
    if settings.seed_json_path:
        session_factory = get_session_factory()
        with session_factory() as session:
            try:
                load_seed_json(session, settings.seed_json_path)
            except Exception:  # noqa: BLE001
                logger.exception("Database seed failed")
                raise
    yield


app = FastAPI(title="WorkLog Settlement API", lifespan=lifespan)

app.include_router(settlement_router)
app.include_router(worklogs_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
