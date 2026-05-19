from dataclasses import asdict
from typing import Annotated

import os
from fastapi import Cookie, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.domain import DocumentService
from app.identity_client import HttpIdentityClient
from app.planner_client import HttpPlannerClient
from app.orchestration import DocumentOrchestrator
from app.platform_clients import HttpAiClient, HttpFilesClient, HttpSearchClient
from app.preview import PreviewOrchestrator
from app.repositories import DocumentRepository
from app.sync import ExternalFileSnapshot, WatchedFolderSyncService

app = FastAPI(title="documents")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3200").split(",") if origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
service = DocumentService()
SessionDep = Annotated[Session, Depends(get_session)]


class ManagedDocumentCreate(BaseModel):
    owner_subject_id: str
    filename: str
    content_type: str
    asset_id: str | None = None


class ExternalDocumentDiscover(BaseModel):
    owner_subject_id: str
    provider: str
    external_file_id: str
    external_path: str | None = None
    filename: str
    revision: str


class WatchedSourceCreate(BaseModel):
    owner_subject_id: str
    provider: str
    root_path: str


class WatchedFileIngest(BaseModel):
    external_file_id: str
    filename: str
    revision: str
    external_path: str | None = None


class WatchedSyncBatch(BaseModel):
    files: list[WatchedFileIngest]


class AnalysisCreate(BaseModel):
    summary: str
    entities: list[str]
    events: list["DetectedEventCreate"] = []


class DetectedEventCreate(BaseModel):
    title: str
    starts_at: str
    description: str | None = None


class EventProposalCreate(BaseModel):
    title: str
    starts_at: str
    description: str | None = None


class EventProposalConfirm(BaseModel):
    planner_event_id: str | None = None
    title: str | None = None
    starts_at: str | None = None
    description: str | None = None
    priority: str | None = None


def _build_identity_client() -> HttpIdentityClient:
    return HttpIdentityClient(base_url=os.getenv("IDENTITY_BASE_URL", "http://identity:8300"))


def _build_search_client() -> HttpSearchClient:
    return HttpSearchClient(base_url=os.getenv("SEARCH_KNOWLEDGE_BASE_URL", "http://search-knowledge:8340"))


def _build_orchestrator(repo: DocumentRepository) -> DocumentOrchestrator:
    return DocumentOrchestrator(
        repo,
        files_client=HttpFilesClient(base_url=os.getenv("FILES_BASE_URL", "http://files:8320")),
        ai_client=HttpAiClient(base_url=os.getenv("AI_RUNTIME_BASE_URL", "http://ai-runtime:8330")),
        search_client=_build_search_client(),
    )


def _build_preview_orchestrator(repo: DocumentRepository) -> PreviewOrchestrator:
    return PreviewOrchestrator(
        repo,
        HttpFilesClient(base_url=os.getenv("FILES_BASE_URL", "http://files:8320")),
    )


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "documents"}


@app.get("/api/v1/auth/session")
def auth_session(ecosystem_session: str | None = Cookie(default=None)) -> dict:
    if not ecosystem_session:
        raise HTTPException(status_code=401, detail="missing session")
    result = _build_identity_client().exchange_browser_session(cookies={"ecosystem_session": ecosystem_session})
    return {"subject_id": result.subject_id, "email": result.email, "username": result.username, "display_name": result.display_name}


@app.post("/api/v1/documents/managed", status_code=status.HTTP_201_CREATED)
def register_managed_document(payload: ManagedDocumentCreate, session: SessionDep) -> dict:
    repo = DocumentRepository(session)
    if payload.asset_id is not None:
        document = _build_orchestrator(repo).register_uploaded_managed_document(**payload.model_dump())
    else:
        document = repo.create_managed_document(**payload.model_dump(exclude={"asset_id"}))
    return _document_to_dict(document)


@app.get("/api/v1/documents")
def list_documents(owner_subject_id: str, session: SessionDep) -> list[dict]:
    return [_document_to_dict(document) for document in DocumentRepository(session).list_documents(owner_subject_id)]


@app.get("/api/v1/documents/{document_id}")
def get_document(document_id: str, session: SessionDep) -> dict:
    document = DocumentRepository(session).get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="document not found")
    return _document_to_dict(document)


@app.post("/api/v1/documents/{document_id}/preview", status_code=status.HTTP_201_CREATED)
def request_document_preview(document_id: str, session: SessionDep) -> dict:
    return {"preview_id": _build_preview_orchestrator(DocumentRepository(session)).request_linked_preview(document_id)}


@app.post("/api/v1/documents/external/discover", status_code=status.HTTP_201_CREATED)
def discover_external_document(payload: ExternalDocumentDiscover, session: SessionDep) -> dict:
    document = DocumentRepository(session).upsert_external_document(**payload.model_dump())
    return _document_to_dict(document)


@app.post("/api/v1/watched-sources", status_code=status.HTTP_201_CREATED)
def create_watched_source(payload: WatchedSourceCreate, session: SessionDep) -> dict:
    source = DocumentRepository(session).create_watched_source(**payload.model_dump())
    return {"id": source.id, "owner_subject_id": source.owner_subject_id, "provider": source.provider, "root_path": source.root_path}


@app.post("/api/v1/watched-sources/{source_id}/files", status_code=status.HTTP_201_CREATED)
def ingest_watched_file(source_id: str, payload: WatchedFileIngest, session: SessionDep) -> dict:
    result = DocumentRepository(session).ingest_watched_file(source_id=source_id, **payload.model_dump())
    return asdict(result)


@app.post("/api/v1/watched-sources/{source_id}/sync")
def sync_watched_source(source_id: str, payload: WatchedSyncBatch, session: SessionDep) -> list[dict]:
    snapshots = [ExternalFileSnapshot(**item.model_dump()) for item in payload.files]
    repo = DocumentRepository(session)
    orchestrator = _build_orchestrator(repo)
    source = repo.get_watched_source(source_id)
    results = WatchedFolderSyncService(
        repo,
        on_discovered=lambda snapshot: orchestrator.register_external_document(
            owner_subject_id=source.owner_subject_id,
            provider=source.provider,
            external_file_id=snapshot.external_file_id,
            external_path=snapshot.external_path,
            filename=snapshot.filename,
            revision=snapshot.revision,
        ),
    ).sync(source_id, snapshots)
    return [asdict(result) for result in results]


@app.post("/api/v1/documents/{document_id}/analysis")
def attach_analysis(document_id: str, payload: AnalysisCreate, session: SessionDep) -> dict:
    repo = DocumentRepository(session)
    record = repo.attach_analysis(document_id=document_id, summary=payload.summary, entities=payload.entities)
    proposals = [
        repo.create_event_proposal(document_id=document_id, **event.model_dump())
        for event in payload.events
    ]
    return {
        "document_id": record.document_id,
        "summary": record.summary,
        "entities_json": record.entities_json,
        "event_proposals": [_proposal_to_dict(proposal) for proposal in proposals],
    }


@app.get("/api/v1/search")
def search(owner_subject_id: str, q: str, session: SessionDep) -> list[dict]:
    return [asdict(hit) for hit in DocumentRepository(session).search(owner_subject_id=owner_subject_id, query=q)]


@app.get("/api/v1/groups")
def list_groups(owner_subject_id: str) -> list[dict]:
    return _build_search_client().list_groups(owner_subject_id=owner_subject_id)


def _document_to_dict(document) -> dict:
    return {
        "id": document.id,
        "owner_subject_id": document.owner_subject_id,
        "filename": document.filename,
        "storage_mode": document.storage_mode,
        "asset_id": document.asset_id,
        "content_type": document.content_type,
        "provider": document.provider,
        "external_file_id": document.external_file_id,
        "external_path": getattr(document, "external_path", None),
        "revision": document.revision,
        "preview_status": document.preview_status,
        "analysis_status": document.analysis_status,
        "analysis_attempts": document.analysis_attempts,
    }


@app.post("/api/v1/documents/{document_id}/event-proposals", status_code=status.HTTP_201_CREATED)
def create_event_proposal(document_id: str, payload: EventProposalCreate, session: SessionDep) -> dict:
    proposal = DocumentRepository(session).create_event_proposal(document_id=document_id, **payload.model_dump())
    return _proposal_to_dict(proposal)


@app.get("/api/v1/documents/{document_id}/event-proposals")
def list_event_proposals(document_id: str, session: SessionDep) -> list[dict]:
    return [_proposal_to_dict(proposal) for proposal in DocumentRepository(session).list_event_proposals(document_id)]


@app.post("/api/v1/event-proposals/{proposal_id}/confirm")
def confirm_event_proposal(proposal_id: str, payload: EventProposalConfirm, session: SessionDep) -> dict:
    repo = DocumentRepository(session)
    proposal = repo.get_event_proposal(proposal_id)
    if any(value is not None for value in (payload.title, payload.starts_at, payload.description, payload.priority)):
        proposal = repo.update_event_proposal(
            proposal_id,
            title=payload.title,
            starts_at=payload.starts_at,
            description=payload.description,
            priority=payload.priority,
        )
    planner_event_id = payload.planner_event_id
    if planner_event_id is None:
        document = repo.get_document(proposal.document_id)
        assert document is not None
        planner_event_id = HttpPlannerClient(
            base_url=os.getenv("PLANNER_BASE_URL", "http://planner-api:8000"),
            internal_api_key=os.getenv("PLANNER_INTERNAL_API_KEY", ""),
        ).create_document_event(
            owner_subject_id=document.owner_subject_id,
            calendar_title="Документы",
            title=proposal.title,
            starts_at=proposal.starts_at,
            description=proposal.description or "",
            priority=proposal.priority,
        )
    confirmed = repo.confirm_event_proposal(proposal_id, planner_event_id=planner_event_id)
    return _proposal_to_dict(confirmed)


def _proposal_to_dict(proposal) -> dict:
    return {
        "id": proposal.id,
        "document_id": proposal.document_id,
        "title": proposal.title,
        "starts_at": proposal.starts_at,
        "description": proposal.description,
        "priority": proposal.priority,
        "confirmed": bool(proposal.confirmed),
        "planner_event_id": proposal.planner_event_id,
    }
