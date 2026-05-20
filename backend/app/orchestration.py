import base64
from typing import Protocol

from app.models import DocumentModel
from app.repositories import DocumentRepository


class FilesClient(Protocol):
    def register_external_asset(self, **payload: str) -> str: ...
    def register_managed_asset(self, **payload: str) -> str: ...
    def download_asset_content(self, asset_id: str) -> bytes: ...


class AiClient(Protocol):
    def create_job(self, **payload: str) -> str: ...
    def analyze_content(self, **payload: str) -> dict: ...


class SearchClient(Protocol):
    def index_document(self, **payload: str) -> None: ...
    def index_entities(self, **payload: str) -> None: ...


class DocumentOrchestrator:
    def __init__(self, repository: DocumentRepository, *, files_client: FilesClient, ai_client: AiClient, search_client: SearchClient):
        self.repository = repository
        self.files_client = files_client
        self.ai_client = ai_client
        self.search_client = search_client

    def register_managed_document(self, *, owner_subject_id: str, filename: str, content_type: str) -> DocumentModel:
        document = self.repository.create_managed_document(owner_subject_id=owner_subject_id, filename=filename, content_type=content_type)
        asset_id = self.files_client.register_managed_asset(owner_subject_id=owner_subject_id, filename=filename, content_type=content_type)
        document = self.repository.assign_asset(document.id, asset_id=asset_id)
        self.ai_client.create_job(document_id=document.id, content_ref=asset_id)
        self.process_document(document)
        return document

    def register_uploaded_managed_document(self, *, owner_subject_id: str, filename: str, content_type: str, asset_id: str) -> DocumentModel:
        document = self.repository.create_managed_document(owner_subject_id=owner_subject_id, filename=filename, content_type=content_type)
        document = self.repository.assign_asset(document.id, asset_id=asset_id)
        self.ai_client.create_job(document_id=document.id, content_ref=asset_id)
        self.process_document(document)
        return document

    def register_external_document(self, *, owner_subject_id: str, provider: str, external_file_id: str, external_path: str | None, filename: str, revision: str, content_type: str | None = None) -> DocumentModel:
        document = self.repository.upsert_external_document(
            owner_subject_id=owner_subject_id,
            provider=provider,
            external_file_id=external_file_id,
            external_path=external_path,
            filename=filename,
            revision=revision,
            content_type=content_type,
        )
        asset_id = self.files_client.register_external_asset(
            owner_subject_id=owner_subject_id,
            provider=provider,
            external_file_id=external_file_id,
            external_path=external_path,
            revision=revision,
            filename=filename,
            content_type=content_type,
        )
        document = self.repository.assign_asset(document.id, asset_id=asset_id)
        self.ai_client.create_job(document_id=document.id, content_ref=asset_id)
        self.process_document(document)
        return document


    def complete_analysis(self, *, document_id: str, summary: str, entities: list[str]) -> None:
        document = self.repository.get_document(document_id)
        assert document is not None
        self.repository.attach_analysis(document_id=document_id, summary=summary, entities=entities)
        text = " ".join([document.filename, summary, *entities])
        self.search_client.index_document(document_id=document_id, owner_subject_id=document.owner_subject_id, text=text)
        self.search_client.index_entities(
            document_id=document_id,
            owner_subject_id=document.owner_subject_id,
            entities=[{"kind": "topic", "name": entity} for entity in entities],
        )

    def process_document(self, document: DocumentModel) -> None:
        if not document.asset_id:
            return
        try:
            content = self.files_client.download_asset_content(document.asset_id)
            analysis = self.ai_client.analyze_content(
                filename=document.filename,
                content_base64=base64.b64encode(content).decode(),
            )
        except AttributeError:
            # Backwards-compatible with simpler clients used by older flows/tests.
            return
        self.complete_analysis(document_id=document.id, summary=analysis["summary"], entities=analysis["entities"])
        for event in analysis.get("events", []):
            self.repository.create_event_proposal(document_id=document.id, **event)
