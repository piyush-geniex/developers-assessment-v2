from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Worklog(Base):
    __tablename__ = "worklog"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    external_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    user_name: Mapped[str] = mapped_column(String(255), nullable=False)
    task_name: Mapped[str] = mapped_column(String(512), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    segments: Mapped[list[TimeSegment]] = relationship(
        back_populates="worklog",
        cascade="all, delete-orphan",
    )
    adjustments: Mapped[list[Adjustment]] = relationship(
        back_populates="worklog",
        cascade="all, delete-orphan",
    )


class TimeSegment(Base):
    __tablename__ = "time_segment"
    __table_args__ = (Index("ix_time_segment_worklog_id", "worklog_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    worklog_id: Mapped[int] = mapped_column(ForeignKey("worklog.id", ondelete="CASCADE"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    dispute_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    worklog: Mapped[Worklog] = relationship(back_populates="segments")


class Adjustment(Base):
    __tablename__ = "adjustment"
    __table_args__ = (Index("ix_adjustment_worklog_id", "worklog_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    worklog_id: Mapped[int] = mapped_column(ForeignKey("worklog.id", ondelete="CASCADE"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    worklog: Mapped[Worklog] = relationship(back_populates="adjustments")
