from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Remittance(Base):
    __tablename__ = "remittance"
    __table_args__ = (
        UniqueConstraint("user_id", "period_start", "period_end", name="uq_remittance_user_period"),
        Index("ix_remittance_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)

    allocations: Mapped[list[RemittanceAllocation]] = relationship(
        back_populates="remittance",
        cascade="all, delete-orphan",
    )


class RemittanceAllocation(Base):
    __tablename__ = "remittance_allocation"
    __table_args__ = (
        Index("ix_remittance_allocation_remittance_id", "remittance_id"),
        Index(
            "uq_remittance_allocation_segment_id",
            "segment_id",
            unique=True,
            postgresql_where=text("segment_id IS NOT NULL"),
        ),
        Index(
            "uq_remittance_allocation_adjustment_id",
            "adjustment_id",
            unique=True,
            postgresql_where=text("adjustment_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    remittance_id: Mapped[int] = mapped_column(
        ForeignKey("remittance.id", ondelete="CASCADE"),
        nullable=False,
    )
    allocation_type: Mapped[str] = mapped_column(String(32), nullable=False)
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("time_segment.id", ondelete="RESTRICT"),
        nullable=True,
    )
    adjustment_id: Mapped[int | None] = mapped_column(
        ForeignKey("adjustment.id", ondelete="RESTRICT"),
        nullable=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)

    remittance: Mapped[Remittance] = relationship(back_populates="allocations")
