from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, event

from src.database import Base


class LedgerEntry(Base):
    __tablename__ = "ledger_entry"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    worklog_id = Column(Integer, ForeignKey("worklog.id"), nullable=True, index=True)
    type = Column(String, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    reference_type = Column(String, nullable=False)
    reference_id = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)


@event.listens_for(LedgerEntry, "before_update")
def _block_ledger_entry_update(mapper, connection, target) -> None:
    raise ValueError("ledger_entry rows are immutable and cannot be updated")


@event.listens_for(LedgerEntry, "before_delete")
def _block_ledger_entry_delete(mapper, connection, target) -> None:
    raise ValueError("ledger_entry rows are immutable and cannot be deleted")
