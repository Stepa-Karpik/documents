from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
from typing import Protocol
from uuid import uuid4


class StorageMode(str, Enum):
    MANAGED = "managed"
    EXTERNAL = "external"


class PlannerClient(Protocol):
    def create_document_event(self, **payload: str) -> str: ...


class NullPlannerClient:
    def create_document_event(self, **payload: str) -> str:
        return f"evt_{uuid4().hex}"


@dataclass(slots=True)
class Document:
    id: str
    owner_subject_id: str
    filename: str
    storage_mode: StorageMode
    content_type: str | None = None
    provider: str | None = None
    external_file_id: str | None = None
    revision: str | None = None
    preview_status: str = "queued"
    analysis_status: str = "queued"
    analysis_attempts: int = 1


@dataclass(slots=True)
class EventProposal:
    id: str
    document_id: str
    title: str
    starts_at: str
    description: str | None = None
    priority: str = "normal"
    confirmed: bool = False
    planner_event_id: str | None = None


@dataclass(slots=True)
class WatchedSource:
    id: str
    owner_subject_id: str
    provider: str
    root_path: str


@dataclass(slots=True)
class SyncResult:
    document_id: str
    action: str


@dataclass(slots=True)
class AnalysisRecord:
    document_id: str
    summary: str
    entities: list[str]


@dataclass(slots=True)
class SearchHit:
    document_id: str
    score: int


def _tokenize(value: str) -> set[str]:
    normalized = value.lower().replace("-", " ")
    return {token for token in normalized.split() if token}


class DocumentService:
    def __init__(self, planner_client: PlannerClient | None = None) -> None:
        self._documents: dict[str, Document] = {}
        self._external_index: dict[tuple[str, str, str], str] = {}
        self._event_proposals: dict[str, EventProposal] = {}
        self._watched_sources: dict[str, WatchedSource] = {}
        self._analysis_records: dict[str, AnalysisRecord] = {}
        self._planner_client = planner_client or NullPlannerClient()

    def register_managed_document(self, *, owner_subject_id: str, filename: str, content_type: str) -> Document:
        document = Document(id=str(uuid4()), owner_subject_id=owner_subject_id, filename=filename, content_type=content_type, storage_mode=StorageMode.MANAGED)
        self._documents[document.id] = document
        return document

    def discover_external_document(self, *, owner_subject_id: str, provider: str, external_file_id: str, filename: str, revision: str) -> Document:
        key = (owner_subject_id, provider, external_file_id)
        existing_id = self._external_index.get(key)
        if existing_id is not None:
            existing = self._documents[existing_id]
            if existing.revision == revision:
                return existing
            updated = replace(existing, filename=filename, revision=revision, preview_status="queued", analysis_status="queued", analysis_attempts=existing.analysis_attempts + 1)
            self._documents[existing_id] = updated
            return updated
        document = Document(id=str(uuid4()), owner_subject_id=owner_subject_id, filename=filename, provider=provider, external_file_id=external_file_id, revision=revision, storage_mode=StorageMode.EXTERNAL)
        self._documents[document.id] = document
        self._external_index[key] = document.id
        return document

    def create_watched_source(self, *, owner_subject_id: str, provider: str, root_path: str) -> WatchedSource:
        source = WatchedSource(id=str(uuid4()), owner_subject_id=owner_subject_id, provider=provider, root_path=root_path)
        self._watched_sources[source.id] = source
        return source

    def ingest_watched_file(self, *, source_id: str, external_file_id: str, filename: str, revision: str) -> SyncResult:
        source = self._watched_sources[source_id]
        key = (source.owner_subject_id, source.provider, external_file_id)
        existing_id = self._external_index.get(key)
        previous_revision = self._documents[existing_id].revision if existing_id else None
        document = self.discover_external_document(owner_subject_id=source.owner_subject_id, provider=source.provider, external_file_id=external_file_id, filename=filename, revision=revision)
        action = "created" if existing_id is None else "unchanged" if previous_revision == revision else "updated"
        return SyncResult(document_id=document.id, action=action)

    def attach_analysis(self, *, document_id: str, summary: str, entities: list[str]) -> AnalysisRecord:
        record = AnalysisRecord(document_id=document_id, summary=summary, entities=entities)
        self._analysis_records[document_id] = record
        return record

    def search(self, *, owner_subject_id: str, query: str) -> list[SearchHit]:
        query_tokens = _tokenize(query)
        hits: list[SearchHit] = []
        for document_id, analysis in self._analysis_records.items():
            document = self._documents[document_id]
            if document.owner_subject_id != owner_subject_id:
                continue
            corpus = " ".join([document.filename, analysis.summary, *analysis.entities])
            score = len(query_tokens & _tokenize(corpus))
            if score:
                hits.append(SearchHit(document_id=document_id, score=score))
        return sorted(hits, key=lambda hit: hit.score, reverse=True)

    def add_event_proposal(self, *, document_id: str, title: str, starts_at: str, description: str | None = None) -> EventProposal:
        proposal = EventProposal(id=str(uuid4()), document_id=document_id, title=title, starts_at=starts_at, description=description)
        self._event_proposals[proposal.id] = proposal
        return proposal

    def update_event_proposal(self, proposal_id: str, **changes: str) -> EventProposal:
        proposal = self._event_proposals[proposal_id]
        allowed = {key: value for key, value in changes.items() if key in {"title", "starts_at", "description", "priority"}}
        updated = replace(proposal, **allowed)
        self._event_proposals[proposal_id] = updated
        return updated

    def confirm_event_proposal(self, proposal_id: str) -> EventProposal:
        proposal = self._event_proposals[proposal_id]
        document = self._documents[proposal.document_id]
        planner_event_id = self._planner_client.create_document_event(
            owner_subject_id=document.owner_subject_id,
            calendar_title="Документы",
            title=proposal.title,
            starts_at=proposal.starts_at,
            description=proposal.description or "",
            priority=proposal.priority,
        )
        confirmed = replace(proposal, confirmed=True, planner_event_id=planner_event_id)
        self._event_proposals[proposal_id] = confirmed
        return confirmed
