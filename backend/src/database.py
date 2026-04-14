from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base, sessionmaker

from src.config import get_database_url

Base = declarative_base()
database_engine = create_engine(get_database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=database_engine, autocommit=False, autoflush=False)


def is_database_reachable() -> bool:
    try:
        with database_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        return False


def create_database_tables() -> None:
    from src.ledger import models as ledger_models  # noqa: F401
    from src.remittances import models as remittances_models  # noqa: F401
    from src.users import models as users_models  # noqa: F401
    from src.worklogs import models as worklogs_models  # noqa: F401

    Base.metadata.create_all(bind=database_engine)


def get_database_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
