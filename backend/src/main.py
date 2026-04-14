from fastapi import FastAPI

from src.database import create_database_tables, is_database_reachable
from src.remittances.routes import router as remittances_router
from src.worklogs.routes import router as worklogs_router

app = FastAPI(title="WorkLog Backend")
app.include_router(worklogs_router)
app.include_router(remittances_router)


@app.on_event("startup")
def startup_event() -> None:
    create_database_tables()


@app.get("/")
def read_root() -> dict:
    return {"data": {"service": "backend", "status": "ok"}}


@app.get("/health")
def read_health() -> dict:
    database_status = "up" if is_database_reachable() else "down"
    return {"data": {"service": "backend", "database": database_status}}
