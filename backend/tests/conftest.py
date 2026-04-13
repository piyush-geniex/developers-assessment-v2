from __future__ import annotations

import os

# Tests use in-memory SQLite; set before importing the application package.
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ.pop("SEED_JSON_PATH", None)

import pytest
from starlette.testclient import TestClient

from app.database import Base, get_db, get_engine, get_session_factory, reset_engine
from app.main import app


def _register_models() -> None:
    from app.settlement import models as _s  # noqa: F401
    from app.worklogs import models as _w  # noqa: F401


@pytest.fixture
def client() -> TestClient:
    reset_engine()
    _register_models()
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session_factory = get_session_factory()

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    reset_engine()
