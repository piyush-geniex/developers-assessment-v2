from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text

from src.database import Base


class Worklog(Base):
    __tablename__ = "worklog"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    task_name = Column(String, nullable=False)
    hourly_rate = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)


class WorklogSegment(Base):
    __tablename__ = "time_segment"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    worklog_id = Column(Integer, ForeignKey("worklog.id"), nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, nullable=False)
    dispute_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)


class WorklogAdjustment(Base):
    __tablename__ = "worklog_adjustment"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    worklog_id = Column(Integer, ForeignKey("worklog.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(Text, nullable=False)
    applied_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
