from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class DocumentModel(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("owner_subject_id", "provider", "external_file_id", name="uq_external_document"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    owner_subject_id: Mapped[str] = mapped_column(String(128), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    storage_mode: Mapped[str] = mapped_column(String(32))
    asset_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_file_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    external_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    revision: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preview_status: Mapped[str] = mapped_column(String(32), default="queued")
    analysis_status: Mapped[str] = mapped_column(String(32), default="queued")
    analysis_attempts: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class WatchedSourceModel(Base):
    __tablename__ = "watched_sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    owner_subject_id: Mapped[str] = mapped_column(String(128), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    root_path: Mapped[str] = mapped_column(String(1024))
    last_scan_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AnalysisRecordModel(Base):
    __tablename__ = "analysis_records"

    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), primary_key=True)
    summary: Mapped[str] = mapped_column(Text)
    entities_json: Mapped[str] = mapped_column(Text)


class EventProposalModel(Base):
    __tablename__ = "event_proposals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    starts_at: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(32), default="normal")
    confirmed: Mapped[int] = mapped_column(Integer, default=0)
    planner_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
