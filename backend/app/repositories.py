from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

import json

from app.models import AnalysisRecordModel, DocumentModel, EventProposalModel, WatchedSourceModel


@dataclass(slots=True)
class SyncResult:
    document_id: str
    action: str


class DocumentRepository:
    def __init__(self, session: Session):
        self.session = session

    def create_managed_document(self, *, owner_subject_id: str, filename: str, content_type: str) -> DocumentModel:
        document = DocumentModel(owner_subject_id=owner_subject_id, filename=filename, content_type=content_type, storage_mode="managed")
        self.session.add(document)
        self.session.commit()
        self.session.refresh(document)
        return document

    def assign_asset(self, document_id: str, *, asset_id: str) -> DocumentModel:
        document = self.get_document(document_id)
        assert document is not None
        document.asset_id = asset_id
        self.session.commit()
        self.session.refresh(document)
        return document

    def get_document(self, document_id: str) -> DocumentModel | None:
        return self.session.get(DocumentModel, document_id)

    def list_documents(self, owner_subject_id: str) -> list[DocumentModel]:
        stmt = select(DocumentModel).where(DocumentModel.owner_subject_id == owner_subject_id).order_by(DocumentModel.created_at.desc())
        return list(self.session.scalars(stmt).all())

    def upsert_external_document(self, *, owner_subject_id: str, provider: str, external_file_id: str, filename: str, revision: str) -> DocumentModel:
        stmt = select(DocumentModel).where(
            DocumentModel.owner_subject_id == owner_subject_id,
            DocumentModel.provider == provider,
            DocumentModel.external_file_id == external_file_id,
        )
        document = self.session.scalar(stmt)
        if document is None:
            document = DocumentModel(owner_subject_id=owner_subject_id, filename=filename, storage_mode="external", provider=provider, external_file_id=external_file_id, revision=revision)
            self.session.add(document)
        elif document.revision != revision:
            document.filename = filename
            document.revision = revision
            document.preview_status = "queued"
            document.analysis_status = "queued"
            document.analysis_attempts += 1
        self.session.commit()
        self.session.refresh(document)
        return document

    def create_watched_source(self, *, owner_subject_id: str, provider: str, root_path: str) -> WatchedSourceModel:
        source = WatchedSourceModel(owner_subject_id=owner_subject_id, provider=provider, root_path=root_path)
        self.session.add(source)
        self.session.commit()
        self.session.refresh(source)
        return source

    def get_watched_source(self, source_id: str) -> WatchedSourceModel:
        source = self.session.get(WatchedSourceModel, source_id)
        assert source is not None
        return source

    def ingest_watched_file(self, *, source_id: str, external_file_id: str, filename: str, revision: str) -> SyncResult:
        source = self.session.get(WatchedSourceModel, source_id)
        assert source is not None
        stmt = select(DocumentModel).where(
            DocumentModel.owner_subject_id == source.owner_subject_id,
            DocumentModel.provider == source.provider,
            DocumentModel.external_file_id == external_file_id,
        )
        existing = self.session.scalar(stmt)
        previous_revision = existing.revision if existing else None
        document = self.upsert_external_document(owner_subject_id=source.owner_subject_id, provider=source.provider, external_file_id=external_file_id, filename=filename, revision=revision)
        if existing is None:
            action = "created"
        elif previous_revision == revision:
            action = "unchanged"
        else:
            action = "updated"
        return SyncResult(document_id=document.id, action=action)


@dataclass(slots=True)
class SearchHit:
    document_id: str
    score: int


def _tokenize(value: str) -> set[str]:
    return {token for token in value.lower().replace("-", " ").split() if token}


def _analysis_corpus(document: DocumentModel, record: AnalysisRecordModel) -> str:
    return " ".join([document.filename, record.summary, *json.loads(record.entities_json)])


class DocumentRepository(DocumentRepository):
    def attach_analysis(self, *, document_id: str, summary: str, entities: list[str]) -> AnalysisRecordModel:
        record = self.session.get(AnalysisRecordModel, document_id)
        if record is None:
            record = AnalysisRecordModel(document_id=document_id, summary=summary, entities_json=json.dumps(entities, ensure_ascii=False))
            self.session.add(record)
        else:
            record.summary = summary
            record.entities_json = json.dumps(entities, ensure_ascii=False)
        self.session.commit()
        self.session.refresh(record)
        return record

    def search(self, *, owner_subject_id: str, query: str) -> list[SearchHit]:
        query_tokens = _tokenize(query)
        stmt = select(DocumentModel, AnalysisRecordModel).join(AnalysisRecordModel, AnalysisRecordModel.document_id == DocumentModel.id).where(DocumentModel.owner_subject_id == owner_subject_id)
        hits: list[SearchHit] = []
        for document, record in self.session.execute(stmt).all():
            score = len(query_tokens & _tokenize(_analysis_corpus(document, record)))
            if score:
                hits.append(SearchHit(document_id=document.id, score=score))
        return sorted(hits, key=lambda hit: hit.score, reverse=True)


class DocumentRepository(DocumentRepository):
    def create_event_proposal(self, *, document_id: str, title: str, starts_at: str, description: str | None = None) -> EventProposalModel:
        proposal = EventProposalModel(document_id=document_id, title=title, starts_at=starts_at, description=description)
        self.session.add(proposal)
        self.session.commit()
        self.session.refresh(proposal)
        return proposal

    def list_event_proposals(self, document_id: str) -> list[EventProposalModel]:
        return list(
            self.session.scalars(
                select(EventProposalModel).where(EventProposalModel.document_id == document_id)
            ).all()
        )

    def get_event_proposal(self, proposal_id: str) -> EventProposalModel:
        proposal = self.session.get(EventProposalModel, proposal_id)
        assert proposal is not None
        return proposal

    def confirm_event_proposal(self, proposal_id: str, *, planner_event_id: str) -> EventProposalModel:
        proposal = self.get_event_proposal(proposal_id)
        assert proposal is not None
        proposal.confirmed = 1
        proposal.planner_event_id = planner_event_id
        self.session.commit()
        self.session.refresh(proposal)
        return proposal
