from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String

from src.database import Base


class Remittance(Base):
    __tablename__ = "remittance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)
    status = Column(String, nullable=False)
    idempotency_key = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)


class RemittanceItem(Base):
    __tablename__ = "remittance_item"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    remittance_id = Column(Integer, ForeignKey("remittance.id"), nullable=False, index=True)
    ledger_entry_id = Column(Integer, ForeignKey("ledger_entry.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
